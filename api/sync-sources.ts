import type { IncomingMessage, ServerResponse } from 'node:http';

interface ApiRequest extends IncomingMessage {
  query?: Record<string, string>;
  body?: unknown;
}

interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

interface MangaUpdatesRecord {
  series_id: number;
  title: string;
  url: string;
  year?: number | string;
  image?: { url?: { original?: string } };
}

interface MangaUpdatesGroup {
  group_id: number;
  name: string;
  url?: string;
  social?: { site?: string; discord?: string };
  active?: boolean;
}

interface MangaUpdatesRelease {
  id: number;
  title: string;
  chapter?: string;
  groups?: { name: string; group_id: number }[];
  release_date?: string;
  time_added?: {
    timestamp: number;
    as_rfc3339?: string;
    as_string?: string;
  };
}

interface MangaUpdatesPublisher {
  publisher_name: string;
  type: string;
  notes?: string | null;
  url?: string;
}

const KNOWN_SCANLATOR_DOMAINS: Record<string, string> = {
  asura: 'https://asuracomic.net',
  'asura scans': 'https://asuracomic.net',
  'diva scans': 'https://divascans.com',
  divascans: 'https://divascans.com',
  genztoons: 'https://genztoons.com',
  'genz toons': 'https://genztoons.com',
  'o translations': 'https://otranslations.com',
  'flame-scans': 'https://flamecomics.xyz',
  'flame scans': 'https://flamecomics.xyz',
  'flame comics': 'https://flamecomics.xyz',
  'reaper scans': 'https://reaperscans.com',
  reaperscans: 'https://reaperscans.com',
  'zero scans': 'https://zeroscans.com',
  zeroscans: 'https://zeroscans.com',
  'void scans': 'https://hivescans.com',
  'hive scans': 'https://hivescans.com',
  'drake scans': 'https://drakescans.com',
  'immortal updates': 'https://immortalupdates.com',
  'cosmic scans': 'https://cosmicscans.com',
  'realm scans': 'https://rizzfables.com',
  rizzfables: 'https://rizzfables.com',
  'luminous scans': 'https://luminousscans.net',
  'mangadex': 'https://mangadex.org',
};

function getFaviconUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
  } catch {
    return '';
  }
}

export function buildScanlatorSeriesUrl(
  scanlatorName: string,
  baseUrl: string,
  seriesTitle: string,
): string {
  if (!baseUrl) return '';
  const cleanTitle = seriesTitle.trim();
  const encoded = encodeURIComponent(cleanTitle);
  const lower = scanlatorName.toLowerCase();

  // If baseUrl already points to a specific series/manga page (not just domain root), keep it
  try {
    const parsed = new URL(baseUrl);
    if (parsed.pathname && parsed.pathname.length > 3 && !['/series', '/manga', '/comics'].includes(parsed.pathname)) {
      return baseUrl;
    }
  } catch {
    // continue
  }

  // Asura: has direct series search /series?name={encoded}
  if (lower.includes('asura')) {
    return `https://asuracomic.net/series?name=${encoded}`;
  }
  // Reaper: /series?query={encoded}
  if (lower.includes('reaper')) {
    return `https://reaperscans.com/series?query=${encoded}`;
  }
  // Flame: /series?search={encoded}
  if (lower.includes('flame')) {
    return `https://flamecomics.xyz/series?search=${encoded}`;
  }
  // MangaDex: /search?q={encoded}
  if (lower.includes('mangadex')) {
    return `https://mangadex.org/search?q=${encoded}`;
  }
  // Zero Scans
  if (lower.includes('zero')) {
    return `https://zeroscans.com/?s=${encoded}&post_type=wp-manga`;
  }
  // Hive Scans / Void Scans
  if (lower.includes('hive') || lower.includes('void')) {
    return `https://hivescans.com/?s=${encoded}&post_type=wp-manga`;
  }
  // Diva Scans
  if (lower.includes('diva')) {
    return `https://divascans.com/?s=${encoded}&post_type=wp-manga`;
  }
  // Genztoons
  if (lower.includes('genz')) {
    return `https://genztoons.com/?s=${encoded}&post_type=wp-manga`;
  }
  // O Translations
  if (lower.includes('o translation')) {
    return `https://otranslations.com/?s=${encoded}`;
  }
  // Drake Scans
  if (lower.includes('drake')) {
    return `https://drakescans.com/?s=${encoded}&post_type=wp-manga`;
  }
  // Cosmic Scans
  if (lower.includes('cosmic')) {
    return `https://cosmicscans.com/?s=${encoded}&post_type=wp-manga`;
  }
  // Realm / Rizzfables
  if (lower.includes('realm') || lower.includes('rizz')) {
    return `https://rizzfables.com/?s=${encoded}&post_type=wp-manga`;
  }
  // Luminous Scans
  if (lower.includes('luminous')) {
    return `https://luminousscans.net/?s=${encoded}&post_type=wp-manga`;
  }
  // Immortal Updates
  if (lower.includes('immortal')) {
    return `https://immortalupdates.com/?s=${encoded}&post_type=wp-manga`;
  }

  // Generic WordPress / scanlator domain fallback
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.origin}/?s=${encoded}&post_type=wp-manga`;
  } catch {
    return baseUrl;
  }
}

export async function fetchScanlationSources(rawTitle: string, alternateTitles: string[] = []) {
  const title = rawTitle.trim();
  if (!title) {
    return { matchedSeries: null, sources: [] };
  }

  // Helper to query MangaUpdates search
  const searchMangaUpdates = async (searchQuery: string) => {
    try {
      const res = await fetch('https://api.mangaupdates.com/v1/series/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VortexScans/1.0',
        },
        body: JSON.stringify({
          search: searchQuery,
          stype: 'title',
          perpage: 5,
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        total_hits: number;
        results?: { record: MangaUpdatesRecord }[];
      };
      return data.results && data.results.length > 0 ? data.results : null;
    } catch {
      return null;
    }
  };

  // 1. Search primary title, fallback to alternate titles if not found
  let searchResults = await searchMangaUpdates(title);
  if (!searchResults && alternateTitles.length > 0) {
    for (const alt of alternateTitles) {
      const cleanAlt = alt?.trim();
      if (!cleanAlt) continue;
      searchResults = await searchMangaUpdates(cleanAlt);
      if (searchResults) break;
    }
  }

  if (!searchResults || searchResults.length === 0) {
    return { matchedSeries: null, sources: [] };
  }

  const comparableTitles = new Set(
    [title, ...alternateTitles]
      .map((value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim())
      .filter(Boolean),
  );
  const bestRecord = searchResults
    .map((result) => result.record)
    .find((record) => comparableTitles.has(
      record.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(),
    ));

  // MangaUpdates search can return a similarly named but unrelated series first.
  // Never use its chapter count unless the result title matches this catalog entry
  // or one of its known alternate titles.
  if (!bestRecord) {
    return { matchedSeries: null, sources: [] };
  }

  const seriesId = bestRecord.series_id;

  // 2. Fetch detail & groups in parallel with 4s timeout
  const [detail, groupsData] = await Promise.all([
    fetch(`https://api.mangaupdates.com/v1/series/${seriesId}`, {
      headers: { 'User-Agent': 'VortexScans/1.0' },
      signal: AbortSignal.timeout(4000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch(`https://api.mangaupdates.com/v1/series/${seriesId}/groups`, {
      headers: { 'User-Agent': 'VortexScans/1.0' },
      signal: AbortSignal.timeout(4000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const totalChapters =
    detail?.latest_chapter ||
    detail?.status?.match(/(\d+)\s+chapters/i)?.[1] ||
    '';

  const groupLatestChapter = new Map<string, string>();
  let overallHighestChapterNum = 0;
  let overallHighestChapterStr = '';
  let overallLatestReleaseTimestamp = 0;

  if (groupsData?.release_list && Array.isArray(groupsData.release_list)) {
    for (const rel of groupsData.release_list as MangaUpdatesRelease[]) {
      const relTime = rel.time_added?.timestamp ? rel.time_added.timestamp * 1000 : 0;
      if (relTime > overallLatestReleaseTimestamp) {
        overallLatestReleaseTimestamp = relTime;
      }

      const rawCh = rel.chapter ? String(rel.chapter).trim() : '';
      if (rawCh) {
        const parts = rawCh.split(/[-–—]/);
        const lastPart = parts[parts.length - 1]?.trim() || '';
        const numVal = parseFloat(lastPart);
        if (!Number.isNaN(numVal) && numVal > overallHighestChapterNum) {
          overallHighestChapterNum = numVal;
          overallHighestChapterStr = lastPart;
        }
      }

      if (rel.groups && Array.isArray(rel.groups)) {
        for (const g of rel.groups) {
          if (rawCh) {
            const currentStored = groupLatestChapter.get(g.name);
            const currentNum = currentStored ? parseFloat(currentStored) : 0;
            const newNum = parseFloat(rawCh.split(/[-–—]/).pop() || '0');
            if (!currentStored || newNum > currentNum) {
              groupLatestChapter.set(g.name, rawCh);
            }
          }
        }
      }
    }
  }

  // Fallback to detail totalChapters if higher
  if (totalChapters) {
    const totalNum = parseFloat(String(totalChapters));
    if (!Number.isNaN(totalNum) && totalNum > overallHighestChapterNum) {
      overallHighestChapterNum = totalNum;
      overallHighestChapterStr = String(totalChapters);
    }
  }

  const sources: {
    name: string;
    url: string;
    logo?: string;
    chapterCount?: string;
    active: boolean;
    type: 'scanlator' | 'official';
  }[] = [];
  const seenNames = new Set<string>();

  // Process scanlator groups
  if (groupsData?.group_list && Array.isArray(groupsData.group_list)) {
    for (const g of groupsData.group_list as MangaUpdatesGroup[]) {
      const rawName = g.name.trim();
      const lowerName = rawName.toLowerCase();
      if (seenNames.has(lowerName)) continue;
      seenNames.add(lowerName);

      let siteUrl = g.social?.site || '';
      if (KNOWN_SCANLATOR_DOMAINS[lowerName]) {
        siteUrl = KNOWN_SCANLATOR_DOMAINS[lowerName];
      } else if (!siteUrl) {
        siteUrl = g.url || '';
      }

      const chCount = groupLatestChapter.get(rawName) || totalChapters || '';
      const seriesUrl = buildScanlatorSeriesUrl(rawName, siteUrl, title);
      const logo = siteUrl ? getFaviconUrl(siteUrl) : '';

      sources.push({
        name: rawName,
        url: seriesUrl,
        logo: logo || undefined,
        chapterCount: chCount ? `${chCount} ch` : undefined,
        active: Boolean(g.active),
        type: 'scanlator',
      });
    }
  }

  // Process official English publishers
  if (detail?.publishers && Array.isArray(detail.publishers)) {
    for (const pub of detail.publishers as MangaUpdatesPublisher[]) {
      if (pub.type === 'English') {
        const lowerName = pub.publisher_name.toLowerCase();
        if (seenNames.has(lowerName)) continue;
        seenNames.add(lowerName);

        const chMatch = pub.notes?.match(/(\d+)\s+chapters/i);
        const chCount = chMatch
          ? `${chMatch[1]} ch`
          : totalChapters
            ? `${totalChapters} ch`
            : undefined;

        const pubUrl = pub.url || '';
        const logo = pubUrl ? getFaviconUrl(pubUrl) : '';

        sources.push({
          name: pub.publisher_name,
          url: pubUrl,
          logo: logo || undefined,
          chapterCount: chCount,
          active: true,
          type: 'official',
        });
      }
    }
  }

  // Sort: active scanlators first, then active officials, then inactive
  sources.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.type !== b.type) return a.type === 'scanlator' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    matchedSeries: {
      id: seriesId,
      title: bestRecord.title,
      year: bestRecord.year ? String(bestRecord.year) : undefined,
      status: detail?.status?.split('\n')[0]?.trim() || '',
      totalChapters: totalChapters ? String(totalChapters) : undefined,
      latestChapterNumber: overallHighestChapterStr || (totalChapters ? String(totalChapters) : undefined),
      lastReleaseTimestamp: overallLatestReleaseTimestamp > 0 ? overallLatestReleaseTimestamp : undefined,
      url: detail?.url || bestRecord.url,
      image: detail?.image?.url?.original || undefined,
    },
    sources,
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
    let title = '';
    let alternateTitles: string[] = [];
    if (request.method === 'GET') {
      const url = new URL(request.url || '', 'http://localhost');
      title = url.searchParams.get('title') || '';
      const rawAlt = url.searchParams.get('alternateTitles');
      if (rawAlt) {
        try {
          alternateTitles = JSON.parse(rawAlt);
        } catch {
          alternateTitles = rawAlt.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }
    } else if (request.method === 'POST') {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      title = (body as { title?: string })?.title || '';
      alternateTitles = (body as { alternateTitles?: string[] })?.alternateTitles || [];
    }

    if (!title.trim()) {
      response.status(400).json({ error: 'Please provide a series title to search.' });
      return;
    }

    const data = await fetchScanlationSources(title, alternateTitles);
    response.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync sources.';
    response.status(500).json({ error: message });
  }
}
