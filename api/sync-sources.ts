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

export async function fetchScanlationSources(rawTitle: string) {
  const title = rawTitle.trim();
  if (!title) {
    return { matchedSeries: null, sources: [] };
  }

  // 1. Search MangaUpdates
  const searchRes = await fetch('https://api.mangaupdates.com/v1/series/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'VortexScans/1.0',
    },
    body: JSON.stringify({
      search: title,
      stype: 'title',
      perpage: 5,
    }),
  });

  if (!searchRes.ok) {
    throw new Error(`MangaUpdates search returned status ${searchRes.status}`);
  }

  const searchData = (await searchRes.json()) as {
    total_hits: number;
    results?: { record: MangaUpdatesRecord }[];
  };

  if (!searchData.results || searchData.results.length === 0) {
    return { matchedSeries: null, sources: [] };
  }

  const bestRecord = searchData.results[0].record;
  const seriesId = bestRecord.series_id;

  // 2. Fetch detail & groups in parallel
  const [detail, groupsData] = await Promise.all([
    fetch(`https://api.mangaupdates.com/v1/series/${seriesId}`, {
      headers: { 'User-Agent': 'VortexScans/1.0' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch(`https://api.mangaupdates.com/v1/series/${seriesId}/groups`, {
      headers: { 'User-Agent': 'VortexScans/1.0' },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const totalChapters =
    detail?.latest_chapter ||
    detail?.status?.match(/(\d+)\s+chapters/i)?.[1] ||
    '';

  const groupLatestChapter = new Map<string, string>();
  if (groupsData?.release_list && Array.isArray(groupsData.release_list)) {
    for (const rel of groupsData.release_list as MangaUpdatesRelease[]) {
      if (rel.groups && Array.isArray(rel.groups)) {
        for (const g of rel.groups) {
          const ch = rel.chapter ? String(rel.chapter).trim() : '';
          if (
            ch &&
            (!groupLatestChapter.has(g.name) ||
              Number(ch) > Number(groupLatestChapter.get(g.name)))
          ) {
            groupLatestChapter.set(g.name, ch);
          }
        }
      }
    }
  }

  const sources: {
    name: string;
    url: string;
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

      sources.push({
        name: rawName,
        url: siteUrl,
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

        sources.push({
          name: pub.publisher_name,
          url: pub.url || '',
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
    if (request.method === 'GET') {
      const url = new URL(request.url || '', 'http://localhost');
      title = url.searchParams.get('title') || '';
    } else if (request.method === 'POST') {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      title = (body as { title?: string })?.title || '';
    }

    if (!title.trim()) {
      response.status(400).json({ error: 'Please provide a series title to search.' });
      return;
    }

    const data = await fetchScanlationSources(title);
    response.status(200).json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync sources.';
    response.status(500).json({ error: message });
  }
}
