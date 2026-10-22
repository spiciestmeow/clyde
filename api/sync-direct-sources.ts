import type { IncomingMessage, ServerResponse } from 'node:http';

interface ApiRequest extends IncomingMessage {
  query?: Record<string, string>;
  body?: unknown;
}

interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export interface DetectedChapterItem {
  number: number;
  title: string;
  url?: string;
  /** ISO timestamp of when this chapter was uploaded on the source site */
  releasedAt?: string;
  /** Which source this chapter's time came from */
  sourceName?: string;
}

export interface DirectSourceScrapeResult {
  success: boolean;
  sourceName: string;
  sourceUrl: string;
  highestChapter: string;
  /** Most recent ISO release timestamp reported for the latest chapter */
  latestReleaseAt?: string;
  /** Source reporting that most recent release timestamp */
  latestReleaseName?: string;
  /** Latest chapter/time detected independently for each successfully scraped source */
  sourceResults: {
    name: string;
    url: string;
    latestChapterNumber: string;
    latestChapterAt?: string;
  }[];
  sourceIssues: {
    name: string;
    url: string;
    reason: string;
  }[];
  detectedChapters: DetectedChapterItem[];
  message: string;
}

function parseMonthDayWithoutYear(text: string): number | null {
  const match = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?!\s*,?\s+\d{4})/i,
  );
  if (!match) return null;

  const monthKey = match[1].slice(0, 3).toLowerCase();
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthKey);
  const day = Number(match[2]);
  if (month < 0 || day < 1 || day > 31) return null;

  const now = new Date();
  let date = new Date(now.getFullYear(), month, day);
  if (date.getMonth() !== month || date.getDate() !== day) return null;

  // Yearless calendar labels refer to the latest occurrence of that date.
  // This handles a date near New Year without interpreting it as a future post.
  if (date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) {
    date = new Date(now.getFullYear() - 1, month, day);
  }
  return date.getTime();
}

/**
 * Parse relative time strings like "3 hours ago", "about 9 hours", "7h ago",
 * "10 mins ago", "yesterday", "2 days ago" into an absolute timestamp (ms).
 */
function parseRelativeTime(text: string): number | null {
  if (!text) return null;
  const s = text.trim().toLowerCase();

  const relRegex =
    /(?:about\s+)?(\d+(?:\.\d+)?)\s*(s|sec(?:ond)?s?|m|min(?:ute)?s?|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years)\b(?:\s*ago)?/i;
  const m = s.match(relRegex);
  if (m) {
    const val = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    let ms = 0;
    if (unit.startsWith('s')) ms = val * 1000;
    else if (unit.startsWith('mi') || unit === 'm') ms = val * 60 * 1000;
    else if (unit.startsWith('h')) ms = val * 60 * 60 * 1000;
    else if (unit.startsWith('d')) ms = val * 24 * 60 * 60 * 1000;
    else if (unit.startsWith('w')) ms = val * 7 * 24 * 60 * 60 * 1000;
    else if (unit.startsWith('mo')) ms = val * 30 * 24 * 60 * 60 * 1000;
    else if (unit.startsWith('y')) ms = val * 365 * 24 * 60 * 60 * 1000;
    return Date.now() - ms;
  }

  if (s === 'yesterday') return Date.now() - 24 * 60 * 60 * 1000;
  // "New" is often a chapter-status badge, not a posting time. Treating it as
  // now makes background sync overwrite the real release age with cron time.
  if (s === 'today' || s === 'just now') return Date.now();

  // Some chapter lists show calendar labels such as "May 29" without a year.
  // Resolve these explicitly instead of relying on browser-specific Date.parse.
  const yearlessDate = parseMonthDayWithoutYear(text);
  if (yearlessDate !== null) return yearlessDate;

  // Try standard ISO / date parsing
  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed) && parsed > 946684800000 && parsed <= Date.now() + 86400000) {
    return parsed;
  }

  return null;
}

/**
 * Given raw HTML surrounding a chapter link/row, try to find a time indicator
 * in the nearby text (e.g. "3 hours ago", "7h ago", or a `<time>` tag).
 */
function extractTimeFromContext(surroundingHtml: string): number | null {
  // Prefer explicit machine-readable dates. Other attributes such as
  // aria-label="Chapter 24" may appear before the actual <time> element.
  const datetimeMatches = surroundingHtml.matchAll(/\bdatetime=["']([^"']+)["']/gi);
  for (const datetimeMatch of datetimeMatches) {
    const ts = parseRelativeTime(datetimeMatch[1]);
    if (ts) return ts;
  }

  // Only inspect title/aria-label values when they themselves contain a time.
  const labelMatches = surroundingHtml.matchAll(/\b(?:title|aria-label)=["']([^"']+)["']/gi);
  for (const labelMatch of labelMatches) {
    const ts = parseRelativeTime(labelMatch[1]);
    if (ts) return ts;
  }

  // Some chapter rows keep upload dates or relative-time labels in data
  // attributes instead of visible text (for example data-time or
  // data-published-at). Inspect only time/date-related data attributes.
  const dataTimeMatches = surroundingHtml.matchAll(/\b(data-[\w-]*(?:time|date|ago|publish|created|tooltip)[\w-]*)=["']([^"']+)["']/gi);
  for (const dataTimeMatch of dataTimeMatches) {
    const value = dataTimeMatch[2].trim();
    const relativeTs = parseRelativeTime(value);
    if (relativeTs) return relativeTs;

    const numericTimestamp = Number(value);
    if (Number.isFinite(numericTimestamp)) {
      const timestampMs = numericTimestamp < 1e12 ? numericTimestamp * 1000 : numericTimestamp;
      if (timestampMs > 946684800000 && timestampMs <= Date.now() + 86400000) return timestampMs;
    }
  }

  // 2. Strip tags, look for relative time text
  const textOnly = surroundingHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const timePatterns = [
    /(?:about\s+)?(\d+)\s*(?:seconds?|secs?|s)\s*(?:ago)?/i,
    /(?:about\s+)?(\d+)\s*(?:minutes?|mins?|m)\s*(?:ago)?/i,
    /(?:about\s+)?(\d+)\s*(?:hours?|hrs?|h)\s*(?:ago)?/i,
    /(?:about\s+)?(\d+)\s*(?:days?|d)\s*(?:ago)?/i,
    /(?:about\s+)?(\d+)\s*(?:weeks?|wks?|w)\s*(?:ago)?/i,
    /(?:about\s+)?(\d+)\s*(?:months?|mos?)\s*(?:ago)?/i,
    /\byesterday\b/i,
    /\bjust now\b/i,
    /\btoday\b/i,
  ];

  for (const pattern of timePatterns) {
    const match = textOnly.match(pattern);
    if (match) {
      const ts = parseRelativeTime(match[0]);
      if (ts) return ts;
    }
  }

  // Some sources display a calendar date (e.g. "October 4, 2026") instead
  // of a relative age. Extract just the date token so unrelated chapter
  // numbers elsewhere in the row cannot confuse Date.parse.
  const absoluteDatePatterns = [
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*[AP]M)?)?/i,
    /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/i,
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b/,
  ];
  for (const pattern of absoluteDatePatterns) {
    const match = textOnly.match(pattern);
    if (match) {
      const ts = parseRelativeTime(match[0]);
      if (ts) return ts;
    }
  }

  return null;
}

/**
 * Find a nearby chapter/list row so a timestamp from the next chapter is not
 * accidentally attributed to this chapter. Many scanlator pages put the time
 * in a sibling element rather than inside the chapter link itself.
 */
function extractChapterRowContext(
  html: string,
  matchStart: number,
  matchEnd: number,
  chapterNumber?: number,
): string | null {
  const searchStart = Math.max(0, matchStart - 2500);
  const prefix = html.slice(searchStart, matchStart);
  // Some sites (including Kayn Scans) use generic nested divs for chapter
  // rows, with the release time in a sibling inside the same row. Walk those
  // ancestors too, while only accepting a small context that identifies this
  // chapter uniquely so we don't borrow the next row's timestamp.
  const rowOpenRegex = /<(li|tr|article|div)\b[^>]*>/gi;
  const candidates: { index: number; tag: string }[] = [];
  let openMatch: RegExpExecArray | null;
  while ((openMatch = rowOpenRegex.exec(prefix)) !== null) {
    const tag = openMatch[1].toLowerCase();
    candidates.push({ index: searchStart + openMatch.index, tag });
  }

  for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
    const candidate = candidates[candidateIndex];
    const openingEnd = html.indexOf('>', candidate.index);
    if (openingEnd < 0 || openingEnd >= matchStart) continue;
    const scanEnd = Math.min(html.length, matchEnd + 6000);
    const tagRegex = new RegExp(`<\\/?${candidate.tag}\\b[^>]*>`, 'gi');
    tagRegex.lastIndex = candidate.index;
    let depth = 0;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(html)) !== null && tagMatch.index < scanEnd) {
      if (/^<\//.test(tagMatch[0])) {
        depth -= 1;
        if (depth === 0) {
          if (tagMatch.index < matchEnd) break;
          const context = html.slice(candidate.index, tagRegex.lastIndex);
          const visibleText = context.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
          const chapterMatches = Array.from(visibleText.matchAll(/\b(?:chapter|episode)\s*(\d+(?:\.\d+)?)/gi))
            .map((chapterMatch) => parseFloat(chapterMatch[1]));
          const uniqueChapters = new Set(chapterMatches);
          if (
            extractTimeFromContext(context) &&
            (chapterNumber === undefined || (uniqueChapters.size === 1 && uniqueChapters.has(chapterNumber)))
          ) {
            return context;
          }
          break;
        }
      } else {
        depth += 1;
      }
    }
  }

  return null;
}

function normalizeSeriesPathSegment(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the original segment when it contains malformed percent encoding.
  }

  return decoded
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function extractChaptersFromHtml(
  html: string,
  pageUrl: string,
  _seriesTitle?: string,
): DetectedChapterItem[] {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(pageUrl);
  } catch {
    return [];
  }

  // 1. Clean HTML of noisy regions that contain other series
  const cleanHtml = html
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(
      /<(?:div|section)[^>]*class=["'][^"']*(?:recommend|related|sidebar|popular|trending|comments|discussion)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/gi,
      '',
    );

  const seriesPath = parsedUrl.pathname.replace(/\/+$/, '');
  const seriesSlug = seriesPath.split('/').filter(Boolean).pop() || '';

  const foundChapters = new Map<number, DetectedChapterItem>();

  // 2. Scan for chapter links with surrounding context for time extraction
  // We use a wider regex that captures the chapter link AND a chunk of surrounding HTML
  const chapterRowRegex =
    /<a\s+[^>]*href=["']([^"']*(?:chapter|ch|ep|episode)[-_/]\d[^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = chapterRowRegex.exec(cleanHtml)) !== null) {
    const href = m[1];
    const innerHtml = m[2];
    const fullMatchEnd = m.index + m[0].length;

    // Source page URLs and chapter links can encode punctuation differently
    // (for example, a curly apostrophe versus an ASCII apostrophe). Compare
    // normalized path segments before rejecting a series-style chapter URL.
    let chapterPath = href;
    try {
      chapterPath = new URL(href, parsedUrl).pathname;
    } catch {
      // Fall back to checking the href text itself.
    }
    const normalizedSeriesSlug = normalizeSeriesPathSegment(seriesSlug);
    const hasMatchingSeriesPathSegment = Boolean(normalizedSeriesSlug) && chapterPath
      .split('/')
      .filter(Boolean)
      .some((segment) => normalizeSeriesPathSegment(segment) === normalizedSeriesSlug);
    const isSeriesLink =
      (seriesSlug && href.includes(seriesSlug)) ||
      href.includes(seriesPath) ||
      hasMatchingSeriesPathSegment;

    if (!isSeriesLink) {
      // Reject links pointing to other series paths
      if (href.startsWith('/comics/') || href.startsWith('/series/') || href.startsWith('/manga/')) {
        continue;
      }
    }

    const hrefChMatch = href.match(/(?:chapter|ch|ep|episode)[-_/](\d+(?:\.\d+)?)/i);
    if (!hrefChMatch) continue;

    const num = parseFloat(hrefChMatch[1]);
    if (Number.isNaN(num) || num < 0 || num >= 5000) continue;

    // Prefer the chapter link itself, then its containing row. Do not search
    // arbitrary text before/after the link: that can belong to an adjacent row.
    let ts = extractTimeFromContext(innerHtml);
    if (!ts) {
      const rowContext = extractChapterRowContext(cleanHtml, m.index, fullMatchEnd, num);
      if (rowContext) ts = extractTimeFromContext(rowContext);
    }

    if (!foundChapters.has(num)) {
      foundChapters.set(num, {
        number: num,
        title: `Chapter ${hrefChMatch[1]}`,
        url: href,
        releasedAt: ts ? new Date(ts).toISOString() : undefined,
      });
    } else if (ts) {
      // If we already have this chapter but no time, update it
      const existing = foundChapters.get(num)!;
      if (!existing.releasedAt) {
        existing.releasedAt = new Date(ts).toISOString();
      }
    }
  }

  // Some series pages use chapter URLs that do not include the word "chapter"
  // (or expose the chapter number only in the link text). If the standard
  // route-based scan found nothing, inspect same-site anchors labelled
  // "Chapter N" as a conservative fallback. Recommendations and sidebars
  // have already been removed from cleanHtml above.
  if (foundChapters.size === 0) {
    const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    while ((m = anchorRegex.exec(cleanHtml)) !== null) {
      const attributes = m[1];
      const innerHtml = m[2];
      const hrefMatch = attributes.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3];
      if (!href) continue;

      let linkUrl: URL;
      try {
        linkUrl = new URL(href, parsedUrl);
      } catch {
        continue;
      }
      if (linkUrl.origin !== parsedUrl.origin) continue;

      const anchorText = innerHtml
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const chapterMatch = anchorText.match(/\bchapter\s*(\d+(?:\.\d+)?)/i)
        || href.match(/(?:chapter|ch|ep|episode)[-_/](\d+(?:\.\d+)?)/i);
      if (!chapterMatch) continue;

      const num = parseFloat(chapterMatch[1]);
      if (Number.isNaN(num) || num < 0 || num >= 5000) continue;

      let ts = extractTimeFromContext(innerHtml);
      if (!ts) {
        const rowContext = extractChapterRowContext(cleanHtml, m.index, m.index + m[0].length, num);
        if (rowContext) ts = extractTimeFromContext(rowContext);
      }

      if (!foundChapters.has(num)) {
        foundChapters.set(num, {
          number: num,
          title: `Chapter ${chapterMatch[1]}`,
          url: href,
          releasedAt: ts ? new Date(ts).toISOString() : undefined,
        });
      }
    }
  }

  // 3. Also check for non-link chapter rows (aria-label patterns, Qi Manga style)
  const ariaRegex =
    /<(?:a|div|li)[^>]*aria-label=["']Chapter\s*(\d+(?:\.\d+)?)["'][^>]*>([\s\S]*?)(?:<\/(?:a|div|li)>)/gi;
  while ((m = ariaRegex.exec(cleanHtml)) !== null) {
    const num = parseFloat(m[1]);
    if (Number.isNaN(num) || num < 0 || num >= 5000) continue;
    if (foundChapters.has(num)) {
      // Try to fill in missing time
      const existing = foundChapters.get(num)!;
      if (!existing.releasedAt) {
        const ts = extractTimeFromContext(m[2]);
        if (ts) existing.releasedAt = new Date(ts).toISOString();
      }
      continue;
    }
    const ts = extractTimeFromContext(m[2]);
    foundChapters.set(num, {
      number: num,
      title: `Chapter ${m[1]}`,
      releasedAt: ts ? new Date(ts).toISOString() : undefined,
    });
  }

  return Array.from(foundChapters.values()).sort((a, b) => b.number - a.number);
}

export async function scrapeDirectSources(
  sources: { name: string; url: string }[],
  title?: string,
): Promise<DirectSourceScrapeResult> {
  // Collect chapters from ALL sources, then merge: for each chapter number,
  // keep the earliest valid posting time. Mirror sites can publish later than
  // the original listing; the series-level timer should reflect when the
  // chapter first appeared, while each source card retains its own timestamp.
  const mergedChapters = new Map<
    number,
    DetectedChapterItem & { releaseTimestamp: number }
  >();
  // `null` means no chapter was found; numeric zero is a valid chapter label.
  let overallHighest: number | null = null;
  let bestSourceName = '';
  let bestSourceUrl = '';
  let bestSourceReleaseTimestamp: number | undefined;
  let anySourceWorked = false;
  const sourceResults: DirectSourceScrapeResult['sourceResults'] = [];
  const sourceIssues: DirectSourceScrapeResult['sourceIssues'] = [];

  for (const src of sources) {
    if (!src?.url) continue;
    let sourceName = src.name?.trim() || 'Unnamed source';
    try {
      const parsed = new URL(src.url);
      sourceName = src.name?.trim() || parsed.hostname;
      if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.length <= 1) {
        sourceIssues.push({ name: sourceName, url: src.url, reason: 'URL does not point to a series page.' });
        continue;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      let res: Response;
      try {
        res = await fetch(src.url, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        sourceIssues.push({ name: sourceName, url: src.url, reason: `Site returned HTTP ${res.status}.` });
        continue;
      }
      const html = await res.text();

      const chapters = extractChaptersFromHtml(html, src.url, title);
      if (chapters.length === 0) {
        sourceIssues.push({
          name: sourceName,
          url: src.url,
          reason: 'Page loaded, but no supported chapter links were found. The page may render chapters with JavaScript or use a layout the scraper does not recognize.',
        });
        continue;
      }
      anySourceWorked = true;

      sourceResults.push({
        name: sourceName,
        url: src.url,
        latestChapterNumber: String(chapters[0].number),
        ...(chapters[0].releasedAt ? { latestChapterAt: chapters[0].releasedAt } : {}),
      });

      for (const ch of chapters) {
        const chTs = ch.releasedAt ? Date.parse(ch.releasedAt) : 0;
        const existing = mergedChapters.get(ch.number);

        if (!existing) {
          mergedChapters.set(ch.number, {
            ...ch,
            sourceName,
            releaseTimestamp: chTs || 0,
          });
        } else {
          // Prefer the earliest real posting time for the series-level timer.
          // Keep the source-specific timestamps separately in sourceResults.
          if (chTs > 0 && (existing.releaseTimestamp === 0 || chTs < existing.releaseTimestamp)) {
            existing.releasedAt = ch.releasedAt;
            existing.releaseTimestamp = chTs;
            existing.sourceName = sourceName;
          }
        }
      }

      const topNum = chapters[0].number;
      const topReleaseTimestamp = chapters[0].releasedAt
        ? Date.parse(chapters[0].releasedAt)
        : undefined;
      if (
        overallHighest === null ||
        topNum > overallHighest ||
        (topNum === overallHighest &&
          topReleaseTimestamp &&
          (!bestSourceReleaseTimestamp || topReleaseTimestamp < bestSourceReleaseTimestamp))
      ) {
        overallHighest = topNum;
        bestSourceName = sourceName;
        bestSourceUrl = src.url;
        bestSourceReleaseTimestamp = topReleaseTimestamp;
      }
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError'
        ? 'Request timed out after 4 seconds.'
        : error instanceof Error
          ? `Could not fetch or parse this source: ${error.message}`
          : 'Could not fetch or parse this source.';
      sourceIssues.push({ name: sourceName, url: src.url, reason });
    }
  }

  if (overallHighest !== null && mergedChapters.size > 0) {
    const sorted = Array.from(mergedChapters.values())
      .sort((a, b) => b.number - a.number)
      .map(({ releaseTimestamp: _rt, ...rest }) => rest);
    const orderedSourceResults = [...sourceResults].sort((a, b) => {
      const chapterDifference = parseFloat(b.latestChapterNumber) - parseFloat(a.latestChapterNumber);
      if (chapterDifference !== 0) return chapterDifference;

      const aTimestamp = a.latestChapterAt ? Date.parse(a.latestChapterAt) : Number.NaN;
      const bTimestamp = b.latestChapterAt ? Date.parse(b.latestChapterAt) : Number.NaN;
      if (Number.isNaN(aTimestamp) && Number.isNaN(bTimestamp)) return 0;
      if (Number.isNaN(aTimestamp)) return 1;
      if (Number.isNaN(bTimestamp)) return -1;
      // For equal chapter numbers, show the oldest posting first.
      return aTimestamp - bTimestamp;
    });

    // Find the earliest reported posting time of the highest chapter
    const highestEntry = mergedChapters.get(overallHighest);
    const latestReleaseAt = highestEntry?.releasedAt;
    const latestReleaseName = highestEntry?.sourceName;

    return {
      success: true,
      sourceName: bestSourceName,
      sourceUrl: bestSourceUrl,
      highestChapter: String(overallHighest),
      latestReleaseAt,
      latestReleaseName,
      sourceResults: orderedSourceResults,
      sourceIssues,
      detectedChapters: sorted,
      message: `Successfully detected ${sorted.length} chapter(s). Latest is Chapter ${overallHighest}${latestReleaseName ? ` (most recently reported by ${latestReleaseName})` : ''}.`,
    };
  }

  return {
    success: false,
    sourceName: '',
    sourceUrl: '',
    highestChapter: '',
    sourceResults: [],
    sourceIssues,
    detectedChapters: [],
    message: anySourceWorked
      ? 'Sources were reachable but no chapter links were detected. Ensure the URLs point to the series page.'
      : 'No chapters could be detected from the added sources. Please ensure the URLs point directly to the series page.',
  };
}

export default async function handler(
  request: ApiRequest,
  response: ApiResponse,
): Promise<void> {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.status(204).json({});
    return;
  }

  try {
    let sources: { name: string; url: string }[] = [];
    let title = '';

    if (request.method === 'POST') {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      sources = (body as { sources?: { name: string; url: string }[] })?.sources || [];
      title = (body as { title?: string })?.title || '';
    } else if (request.method === 'GET') {
      const url = new URL(request.url || '', 'http://localhost');
      title = url.searchParams.get('title') || '';
      const rawSources = url.searchParams.get('sources');
      if (rawSources) {
        try {
          sources = JSON.parse(rawSources);
        } catch {
          // ignore
        }
      }
    }

    if (!Array.isArray(sources) || sources.length === 0) {
      response.status(400).json({
        success: false,
        message: 'No sources provided to scan.',
      });
      return;
    }

    const result = await scrapeDirectSources(sources, title);
    response.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to scan direct sources.';
    response.status(500).json({ success: false, message });
  }
}
