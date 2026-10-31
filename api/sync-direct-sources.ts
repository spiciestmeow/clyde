import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchPublicPage } from './_lib/public-fetch.js';
import {
  extractChaptersFromHtml,
  extractLagoonHomepageChapterTimestamp,
  extractPageLastUpdate,
} from './_lib/direct-source-parser.js';
import { extractChaptersWithRelativeRowTimes } from './_lib/relative-chapter-time-parser.js';
import type { DetectedChapterItem } from './_lib/direct-source-parser.js';
export type { DetectedChapterItem } from './_lib/direct-source-parser.js';

interface ApiRequest extends IncomingMessage {
  query?: Record<string, string>;
  body?: unknown;
}

interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
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
    rating?: string;
  }[];
  highestRating?: string;
  sourceIssues: {
    name: string;
    url: string;
    reason: string;
  }[];
  detectedChapters: DetectedChapterItem[];
  message: string;
}

export function extractRatingFromHtml(html: string, _url?: string): number | null {
  if (!html) return null;

  // 1. Asura / Next.js / Nuxt serialized hydration JSON
  const asuraMatch = html.match(/(?:&quot;|"|\\")rating(?:&quot;|"|\\")\s*:\s*(?:\[\s*\d+\s*,\s*|"?)([0-9](?:\.[0-9]{1,2})?)/i);
  if (asuraMatch) {
    const val = parseFloat(asuraMatch[1]);
    if (val >= 1 && val <= 10) return val;
  }

  // 2. Schema.org / Microdata ratingValue
  const microdataMatch = html.match(/itemprop=["']ratingValue["'][^>]*content=["']([0-9.]+)/i) ||
                         html.match(/itemprop=["']ratingValue["'][^>]*>([0-9.]+)/i);
  if (microdataMatch) {
    const val = parseFloat(microdataMatch[1]);
    if (val >= 1 && val <= 10) return val;
    if (val > 10 && val <= 100) return parseFloat((val / 10).toFixed(1));
  }

  // 3. JSON-LD: "ratingValue"
  const jsonLdMatch = html.match(/"ratingValue"\s*:\s*"?([0-9.]+)"?/i);
  if (jsonLdMatch) {
    const val = parseFloat(jsonLdMatch[1]);
    if (val >= 1 && val <= 10) return val;
    if (val > 10 && val <= 100) return parseFloat((val / 10).toFixed(1));
  }

  // 4. Common scanlator themes (Madara / MangaStream / Kirei)
  const classMatches = [
    /class=["'][^"']*(?:post-total-rating|rating-prc|score|rating-num|ratingValue)[^"']*["'][^>]*>[\s\S]*?([0-9]\.[0-9]{1,2})/i,
    /<span[^>]*class=["'][^"']*(?:score|rating|num|grade)[^"']*["'][^>]*>([0-9]\.[0-9]{1,2})<\/span>/i,
    /<div[^>]*class=["'][^"']*(?:score|rating|num|grade)[^"']*["'][^>]*>([0-9]\.[0-9]{1,2})<\/div>/i,
    /(?:Rating|Score)\s*:?\s*<[^>]+>\s*([0-9]\.[0-9]{1,2})/i,
    /(?:Rating|Score)\s*:?\s*([0-9]\.[0-9]{1,2})\s*\/\s*10/i,
    /(?:Rating|Score)\s*:?\s*([0-9]\.[0-9]{1,2})\s*(?:out of 10|stars)?/i,
  ];

  for (const regex of classMatches) {
    const m = html.match(regex);
    if (m) {
      const val = parseFloat(m[1]);
      if (val >= 1 && val <= 10) return val;
    }
  }

  return null;
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

      const res = await fetchPublicPage(src.url);

      if (!res.ok) {
        sourceIssues.push({ name: sourceName, url: src.url, reason: `Site returned HTTP ${res.status}.` });
        continue;
      }
      const html = res.text;

      // Parse relative chapter URLs against the final URL after redirects.
      // Some scan sites switch between www and apex hosts or canonicalize
      // their series route before serving the chapter list.
      const resolvedSourceUrl = res.url || src.url;
      const sourceHostname = new URL(resolvedSourceUrl).hostname;
      const usesAdjacentRelativeTimes = /(^|\.)drakecomic\.net$/i.test(sourceHostname)
        || /(^|\.)elftoon\.net$/i.test(sourceHostname)
        || /(^|\.)witchtoons\.net$/i.test(sourceHostname);
      const chapters = usesAdjacentRelativeTimes
        ? extractChaptersWithRelativeRowTimes(html, resolvedSourceUrl)
        : extractChaptersFromHtml(html, resolvedSourceUrl, title);
      if (chapters.length === 0) {
        sourceIssues.push({
          name: sourceName,
          url: src.url,
          reason: 'Page loaded, but no supported chapter links were found. The page may render chapters with JavaScript or use a layout the scraper does not recognize.',
        });
        continue;
      }
      // Lagoon's detail page shows calendar dates, while its homepage cards
      // can expose a more precise relative age. Only replace the detail-page
      // value when the matching series card and same chapter are found.
      if (/lagoon/i.test(sourceHostname) && chapters[0]) {
        try {
          const homepageUrl = new URL('/', resolvedSourceUrl).toString();
          const homepageResponse = await fetchPublicPage(homepageUrl);
          if (homepageResponse.ok) {
            const homepageTimestamp = extractLagoonHomepageChapterTimestamp(
              homepageResponse.text,
              homepageResponse.url || homepageUrl,
              resolvedSourceUrl,
              chapters[0].number,
              title,
            );
            if (homepageTimestamp) chapters[0].releasedAt = homepageTimestamp;
          }
        } catch {
          // Keep the timestamp from the series page if the optional homepage
          // lookup fails or Lagoon changes its homepage markup.
        }
      }
      if (chapters.length > 0 && !chapters[0].releasedAt) {
        const pageLastUpdate = extractPageLastUpdate(html);
        if (pageLastUpdate) {
          chapters[0].releasedAt = new Date(pageLastUpdate).toISOString();
        }
      }
      anySourceWorked = true;

      const detectedRating = extractRatingFromHtml(html, res.url || src.url);

      sourceResults.push({
        name: sourceName,
        url: src.url,
        latestChapterNumber: String(chapters[0].number),
        ...(chapters[0].releasedAt ? { latestChapterAt: chapters[0].releasedAt } : {}),
        ...(detectedRating ? { rating: String(detectedRating) } : {}),
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

    const detectedRatings = orderedSourceResults
      .map((s) => parseFloat(s.rating || ''))
      .filter((r) => !Number.isNaN(r) && r > 0);
    const highestRating = detectedRatings.length
      ? String(Math.max(...detectedRatings))
      : undefined;

    return {
      success: true,
      sourceName: bestSourceName,
      sourceUrl: bestSourceUrl,
      highestChapter: String(overallHighest),
      latestReleaseAt,
      latestReleaseName,
      sourceResults: orderedSourceResults,
      highestRating,
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

    if (sources.length > 10 || sources.some((source) => typeof source?.url !== 'string' || source.url.length > 2048)) {
      response.status(400).json({
        success: false,
        message: 'Provide at most 10 source URLs, each no longer than 2048 characters.',
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
