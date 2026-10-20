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
  /** ISO timestamp of the earliest upload of the latest chapter across all sources */
  earliestReleaseAt?: string;
  /** Name of the source that uploaded it first */
  earliestReleaseName?: string;
  detectedChapters: DetectedChapterItem[];
  message: string;
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
  if (s === 'today' || s === 'just now' || s === 'new') return Date.now();

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
  // 1. Check for <time> or <span> with datetime attribute
  const datetimeMatch = surroundingHtml.match(
    /(?:datetime|title|aria-label)=["']([^"']+)["']/i,
  );
  if (datetimeMatch) {
    const ts = parseRelativeTime(datetimeMatch[1]);
    if (ts) return ts;
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

  return null;
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

    // Check if the link is for THIS series
    const isSeriesLink = (seriesSlug && href.includes(seriesSlug)) || href.includes(seriesPath);

    if (!isSeriesLink) {
      // Reject links pointing to other series paths
      if (href.startsWith('/comics/') || href.startsWith('/series/') || href.startsWith('/manga/')) {
        continue;
      }
    }

    const hrefChMatch = href.match(/(?:chapter|ch|ep|episode)[-_/](\d+(?:\.\d+)?)/i);
    if (!hrefChMatch) continue;

    const num = parseFloat(hrefChMatch[1]);
    if (Number.isNaN(num) || num <= 0 || num >= 5000) continue;

    // Extract time from: (a) inner HTML of the <a> tag, or (b) surrounding context (next ~500 chars)
    const contextAfter = cleanHtml.slice(fullMatchEnd, fullMatchEnd + 500);
    // For Asura-style: time is in a sibling div right after the chapter text inside the <a>
    let ts = extractTimeFromContext(innerHtml);
    if (!ts) {
      // For sites where time is a sibling element after the <a> (like some WordPress themes)
      ts = extractTimeFromContext(contextAfter);
    }
    // Also look slightly before the match for container context
    if (!ts) {
      const contextBefore = cleanHtml.slice(Math.max(0, m.index - 300), m.index);
      ts = extractTimeFromContext(contextBefore);
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

  // 3. Also check for non-link chapter rows (aria-label patterns, Qi Manga style)
  const ariaRegex =
    /<(?:a|div|li)[^>]*aria-label=["']Chapter\s*(\d+(?:\.\d+)?)["'][^>]*>([\s\S]*?)(?:<\/(?:a|div|li)>)/gi;
  while ((m = ariaRegex.exec(cleanHtml)) !== null) {
    const num = parseFloat(m[1]);
    if (Number.isNaN(num) || num <= 0 || num >= 5000) continue;
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
  // keep the EARLIEST upload time across all sources.
  const mergedChapters = new Map<
    number,
    DetectedChapterItem & { releaseTimestamp: number }
  >();
  let overallHighest = 0;
  let bestSourceName = '';
  let bestSourceUrl = '';
  let anySourceWorked = false;

  for (const src of sources) {
    if (!src?.url) continue;
    try {
      const parsed = new URL(src.url);
      if (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.length <= 1) {
        continue;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(src.url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timeoutId);

      if (!res.ok) continue;
      const html = await res.text();

      const chapters = extractChaptersFromHtml(html, src.url, title);
      if (chapters.length === 0) continue;
      anySourceWorked = true;

      const srcName = src.name || parsed.hostname;

      for (const ch of chapters) {
        const chTs = ch.releasedAt ? Date.parse(ch.releasedAt) : 0;
        const existing = mergedChapters.get(ch.number);

        if (!existing) {
          mergedChapters.set(ch.number, {
            ...ch,
            sourceName: srcName,
            releaseTimestamp: chTs || 0,
          });
        } else {
          // Keep the EARLIEST real upload time (the first source to upload)
          if (chTs > 0 && (existing.releaseTimestamp === 0 || chTs < existing.releaseTimestamp)) {
            existing.releasedAt = ch.releasedAt;
            existing.releaseTimestamp = chTs;
            existing.sourceName = srcName;
          }
        }
      }

      const topNum = chapters[0].number;
      if (topNum > overallHighest) {
        overallHighest = topNum;
        bestSourceName = srcName;
        bestSourceUrl = src.url;
      }
    } catch {
      // Continue to next source
    }
  }

  if (overallHighest > 0 && mergedChapters.size > 0) {
    const sorted = Array.from(mergedChapters.values())
      .sort((a, b) => b.number - a.number)
      .map(({ releaseTimestamp: _rt, ...rest }) => rest);

    // Find the earliest release of the highest chapter across all sources
    const highestEntry = mergedChapters.get(overallHighest);
    const earliestReleaseAt = highestEntry?.releasedAt;
    const earliestReleaseName = highestEntry?.sourceName;

    return {
      success: true,
      sourceName: bestSourceName,
      sourceUrl: bestSourceUrl,
      highestChapter: String(overallHighest),
      earliestReleaseAt,
      earliestReleaseName,
      detectedChapters: sorted,
      message: `Successfully detected ${sorted.length} chapter(s). Latest is Chapter ${overallHighest}${earliestReleaseName ? ` (first uploaded by ${earliestReleaseName})` : ''}.`,
    };
  }

  return {
    success: false,
    sourceName: '',
    sourceUrl: '',
    highestChapter: '',
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
