import { extractChaptersFromHtml, type DetectedChapterItem } from './direct-source-parser.js';

const RELATIVE_TIME = /\b(?:about\s+)?(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?)\s*(?:ago)?\b/i;

function parseDrakeRelativeTime(value: string): string | undefined {
  const match = value.match(RELATIVE_TIME);
  if (!match) return undefined;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const unitMs = unit.startsWith('s')
    ? 1_000
    : unit.startsWith('mi')
      ? 60_000
      : unit.startsWith('h')
        ? 3_600_000
        : unit.startsWith('d')
          ? 86_400_000
          : unit.startsWith('w')
            ? 604_800_000
            : unit.startsWith('mo')
              ? 2_592_000_000
              : 31_536_000_000;

  const timestamp = Date.now() - amount * unitMs;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function visibleText(html: string): string {
  return decodeHtml(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '))
    .trim();
}

function timeInHtml(html: string): string | undefined {
  // Drake renders reader-facing ages as visible text, but keep support for
  // title/data attributes in case its chapter row uses a tooltip instead.
  for (const match of html.matchAll(/(?:title|aria-label|datetime|data-[\w-]*(?:time|date|ago|publish|created)[\w-]*)\s*=\s*["']([^"']+)["']/gi)) {
    const timestamp = parseDrakeRelativeTime(decodeHtml(match[1]));
    if (timestamp) return timestamp;
  }

  return parseDrakeRelativeTime(visibleText(html));
}

function chapterNumberFromAnchor(attributes: string, innerHtml: string): number | undefined {
  const text = visibleText(innerHtml);
  const label = text.match(/\bchapter\s*#?\s*(\d+(?:\.\d+)?)/i);
  const href = attributes.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || '';
  const route = href.match(/(?:chapter|ch|ep|episode)[-_/](\d+(?:\.\d+)?)(?![a-z0-9])/i);
  const value = label?.[1] || route?.[1];
  if (!value) return undefined;

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number < 5000 ? number : undefined;
}

/**
 * Some scanlator sites (including Drake Scans and ElfToon) place relative
 * chapter ages beside chapter links in nested chapter rows. The generic
 * scraper finds the links, but its conservative row boundary can miss these
 * layouts. Keep chapter detection shared and resolve nearby timestamps here.
 */
export function extractChaptersWithRelativeRowTimes(html: string, pageUrl: string): DetectedChapterItem[] {
  const chapters = extractChaptersFromHtml(html, pageUrl);
  if (!chapters.length) return chapters;

  let baseUrl: URL;
  try {
    baseUrl = new URL(pageUrl);
  } catch {
    return chapters;
  }

  const anchors: { start: number; end: number; number: number; href: string }[] = [];
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let anchorMatch: RegExpExecArray | null;
  while ((anchorMatch = anchorRegex.exec(html)) !== null) {
    const number = chapterNumberFromAnchor(anchorMatch[1], anchorMatch[2]);
    const href = anchorMatch[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (number === undefined || !href) continue;
    anchors.push({
      start: anchorMatch.index,
      end: anchorMatch.index + anchorMatch[0].length,
      number,
      href,
    });
  }

  return chapters.map((chapter) => {
    const anchor = anchors.find((candidate) => {
      if (candidate.number !== chapter.number) return false;
      if (!chapter.url) return true;
      try {
        return new URL(candidate.href, baseUrl).href === new URL(chapter.url, baseUrl).href;
      } catch {
        return candidate.href === chapter.url;
      }
    });
    if (!anchor) return chapter;

    const searchStart = Math.max(0, anchor.start - 5000);
    const prefix = html.slice(searchStart, anchor.start);
    const ancestorStarts: { index: number; tag: string }[] = [];
    const openingTags = /<(li|tr|article|section|div)\b[^>]*>/gi;
    let opening: RegExpExecArray | null;
    while ((opening = openingTags.exec(prefix)) !== null) {
      ancestorStarts.push({ index: searchStart + opening.index, tag: opening[1].toLowerCase() });
    }

    // Walk from the closest likely row outward. Accept only a bounded context
    // identifying this chapter alone, so the next row's age cannot leak in.
    for (let index = ancestorStarts.length - 1; index >= 0; index -= 1) {
      const ancestor = ancestorStarts[index];
      const tagRegex = new RegExp(`<\\/?${ancestor.tag}\\b[^>]*>`, 'gi');
      tagRegex.lastIndex = ancestor.index;
      let depth = 0;
      let tagMatch: RegExpExecArray | null;
      while ((tagMatch = tagRegex.exec(html)) !== null && tagMatch.index < anchor.end + 8000) {
        if (/^<\//.test(tagMatch[0])) {
          depth -= 1;
          if (depth === 0) {
            if (tagMatch.index < anchor.end) break;
            const row = html.slice(ancestor.index, tagRegex.lastIndex);
            const rowChapters = Array.from(visibleText(row).matchAll(/\bchapter\s*#?\s*(\d+(?:\.\d+)?)/gi))
              .map((match) => Number(match[1]));
            const uniqueChapters = new Set(rowChapters);
            if (uniqueChapters.size !== 1 || !uniqueChapters.has(chapter.number)) break;
            const releasedAt = timeInHtml(row);
            if (releasedAt) return { ...chapter, releasedAt };
            break;
          }
        } else {
          depth += 1;
        }
      }
    }

    // Some Drake layouts place the time as a sibling outside the row wrapper.
    // Search only the interval bounded by neighboring chapter links.
    const anchorIndex = anchors.indexOf(anchor);
    const previous = anchors[anchorIndex - 1];
    const next = anchors[anchorIndex + 1];
    const boundedStart = previous ? Math.floor((previous.end + anchor.start) / 2) : Math.max(0, anchor.start - 1000);
    const boundedEnd = next ? Math.ceil((anchor.end + next.start) / 2) : Math.min(html.length, anchor.end + 1000);
    const boundedTime = timeInHtml(html.slice(boundedStart, boundedEnd));
    return boundedTime ? { ...chapter, releasedAt: boundedTime } : chapter;
  });
}
