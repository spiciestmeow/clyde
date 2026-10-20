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
}

export interface DirectSourceScrapeResult {
  success: boolean;
  sourceName: string;
  sourceUrl: string;
  highestChapter: string;
  detectedChapters: DetectedChapterItem[];
  message: string;
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

  // 1. Clean HTML of noisy regions that contain other series (recommendations, footer, sidebar)
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

  // 2. Look for <a> tags
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRegex.exec(cleanHtml)) !== null) {
    const href = m[1];
    const innerText = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Check if the link is a chapter link for THIS series
    const isSeriesLink = (seriesSlug && href.includes(seriesSlug)) || href.includes(seriesPath);

    // Check chapter number in href (e.g. chapter/8, chapter-8, ch-8)
    const hrefChMatch = href.match(/(?:chapter|ch|ep|episode)[-_/](\d+(?:\.\d+)?)/i);
    // Check chapter number in inner text or aria-label
    const textChMatch = innerText.match(/(?:chapter|ch|episode|ep)\.?\s*(\d+(?:\.\d+)?)/i);

    if (isSeriesLink) {
      if (hrefChMatch) {
        const num = parseFloat(hrefChMatch[1]);
        if (!Number.isNaN(num) && num > 0 && num < 5000 && !foundChapters.has(num)) {
          foundChapters.set(num, { number: num, title: `Chapter ${hrefChMatch[1]}`, url: href });
        }
      } else if (textChMatch) {
        const num = parseFloat(textChMatch[1]);
        if (!Number.isNaN(num) && num > 0 && num < 5000 && !foundChapters.has(num)) {
          foundChapters.set(num, { number: num, title: `Chapter ${textChMatch[1]}`, url: href });
        }
      }
    } else {
      // If href didn't explicitly include the series slug, only accept if href doesn't point to another manga path
      if (
        hrefChMatch &&
        !href.startsWith('/comics/') &&
        !href.startsWith('/series/') &&
        !href.startsWith('/manga/')
      ) {
        const num = parseFloat(hrefChMatch[1]);
        if (!Number.isNaN(num) && num > 0 && num < 5000 && !foundChapters.has(num)) {
          foundChapters.set(num, { number: num, title: `Chapter ${hrefChMatch[1]}`, url: href });
        }
      }
    }
  }

  // 3. Look for dedicated chapter items (e.g. aria-label="Chapter 8")
  const ariaRegex = /<(?:a|div|li)[^>]*aria-label=["']Chapter\s*(\d+(?:\.\d+)?)["'][^>]*>/gi;
  while ((m = ariaRegex.exec(cleanHtml)) !== null) {
    const num = parseFloat(m[1]);
    if (!Number.isNaN(num) && num > 0 && num < 5000 && !foundChapters.has(num)) {
      foundChapters.set(num, { number: num, title: `Chapter ${m[1]}` });
    }
  }

  return Array.from(foundChapters.values()).sort((a, b) => b.number - a.number);
}

export async function scrapeDirectSources(
  sources: { name: string; url: string }[],
  title?: string,
): Promise<DirectSourceScrapeResult> {
  let highestChapterNum = 0;
  let bestSourceName = '';
  let bestSourceUrl = '';
  let bestChapters: DetectedChapterItem[] = [];

  for (const src of sources) {
    if (!src?.url) continue;
    try {
      const parsed = new URL(src.url);
      // Skip root homepages with no specific series path
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
      if (chapters.length > 0) {
        const topNum = chapters[0].number;
        if (topNum > highestChapterNum || bestChapters.length === 0) {
          highestChapterNum = topNum;
          bestSourceName = src.name || parsed.hostname;
          bestSourceUrl = src.url;
          bestChapters = chapters;
        }
      }
    } catch {
      // Continue to next source
    }
  }

  if (highestChapterNum > 0 && bestChapters.length > 0) {
    return {
      success: true,
      sourceName: bestSourceName,
      sourceUrl: bestSourceUrl,
      highestChapter: String(highestChapterNum),
      detectedChapters: bestChapters,
      message: `Successfully detected ${bestChapters.length} chapter(s) from ${bestSourceName}. Latest is Chapter ${highestChapterNum}.`,
    };
  }

  return {
    success: false,
    sourceName: '',
    sourceUrl: '',
    highestChapter: '',
    detectedChapters: [],
    message: 'No chapters could be detected from the added sources. Please ensure the URLs point directly to the series page.',
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
