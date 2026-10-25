import type { IncomingMessage, ServerResponse } from 'node:http';

export const maxDuration = 30;

interface ApiRequest extends IncomingMessage {
  query?: Record<string, string>;
  body?: any;
}

interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

export type ImportedSeriesData = {
  id: string;
  source: 'mangadex' | 'mangabaka' | 'mangaupdates' | 'direct';
  title: string;
  alternateTitles: string[];
  description: string;
  authors: string[];
  artists: string[];
  publishers: string[];
  type: string;
  contentRating: string;
  status: string;
  year: string;
  originalLanguage: string;
  demographics: string[];
  genres: string[];
  formats: string[];
  tags: string[];
  coverUrl?: string;
  rating?: string;
  trackerUrl?: string;
  sources?: { name: string; url: string; rating?: string }[];
};

const GENRES_LIST = [
  'Action', 'Adult', 'Adventure', 'Boys Love', 'Comedy', 'Crime', 'Drama', 'Ecchi',
  'Fantasy', 'Girls Love', 'Harem', 'Hentai', 'Historical', 'Horror', 'Isekai',
  'Magical Girls', 'Mecha', 'Medical', 'Mystery', 'Philosophical', 'Psychological',
  'Romance', 'Sci-Fi', 'Slice of Life', 'Smut', 'Sports', 'Superhero', 'Thriller',
  'Tragedy', 'Wuxia'
];

const FORMATS_LIST = [
  '4-Koma', 'Adaptation', 'Anthology', 'Award Winning', 'Doujinshi', 'Full Color',
  'Long Strip', 'Oneshot', 'Web Comic'
];

// 1. MangaDex Import Handler
async function importFromMangaDex(urlOrId: string): Promise<ImportedSeriesData> {
  const trimmed = urlOrId.trim();
  const urlMatch = trimmed.match(/mangadex\.org\/(?:title|manga)\/([^/?#]+)/i);
  const id = (urlMatch ? urlMatch[1] : trimmed).toLowerCase();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!uuidRegex.test(id)) {
    throw new Error(`Invalid MangaDex ID or URL: ${id}`);
  }

  const endpoint = `https://api.mangadex.org/manga/${id}?includes[]=author&includes[]=artist&includes[]=cover_art`;
  const res = await fetch(endpoint, {
    headers: {
      'User-Agent': 'VortexScans/1.0 (contact@vortexscans.org)',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`MangaDex API returned status ${res.status}`);
  }

  const json = await res.json();
  const manga = json?.data;
  const attributes = manga?.attributes;
  if (!attributes) {
    throw new Error('MangaDex manga data not found.');
  }

  // Extract primary English title, fallback to other titles
  const titleObj = attributes.title || {};
  let title = (titleObj.en || '').trim();

  // Alternative titles
  const alternateTitles: string[] = [];
  if (Array.isArray(attributes.altTitles)) {
    for (const altObj of attributes.altTitles) {
      if (altObj && typeof altObj === 'object') {
        for (const [lang, val] of Object.entries(altObj)) {
          if (typeof val === 'string' && val.trim()) {
            const clean = val.trim();
            if (!title && lang === 'en') title = clean;
            if (!alternateTitles.includes(clean)) alternateTitles.push(clean);
          }
        }
      }
    }
  }

  if (!title) {
    title = (titleObj['ja-ro'] || titleObj['ko-ro'] || titleObj['zh-ro'] || Object.values(titleObj)[0] || '').trim();
  }

  const descObj = attributes.description || {};
  const description = (descObj.en || Object.values(descObj)[0] || '').trim();

  const authors: string[] = [];
  const artists: string[] = [];
  let coverFileName = '';

  if (Array.isArray(manga.relationships)) {
    for (const rel of manga.relationships) {
      if (rel.type === 'author' && rel.attributes?.name) {
        authors.push(rel.attributes.name.trim());
      } else if (rel.type === 'artist' && rel.attributes?.name) {
        artists.push(rel.attributes.name.trim());
      } else if (rel.type === 'cover_art' && rel.attributes?.fileName) {
        coverFileName = rel.attributes.fileName;
      }
    }
  }

  const langCode = (attributes.originalLanguage || '').toLowerCase();
  let originalLanguage = 'Japanese';
  let type = 'Manga';

  if (langCode === 'ko') {
    originalLanguage = 'Korean';
    type = 'Manhwa';
  } else if (langCode === 'zh' || langCode === 'zh-hk') {
    originalLanguage = 'Chinese';
    type = 'Manhua';
  } else if (langCode === 'en') {
    originalLanguage = 'English';
    type = 'Comic';
  } else if (langCode) {
    originalLanguage = 'Other';
  }

  const rawStatus = (attributes.status || '').toLowerCase();
  let status = 'Releasing';
  if (rawStatus === 'completed') status = 'Completed';
  else if (rawStatus === 'hiatus') status = 'Hiatus';
  else if (rawStatus === 'cancelled') status = 'Cancelled';

  const rawRating = (attributes.contentRating || '').toLowerCase();
  let contentRating = 'Safe';
  if (rawRating === 'suggestive') contentRating = 'Suggestive';
  else if (rawRating === 'erotica') contentRating = 'Erotica';
  else if (rawRating === 'pornographic') contentRating = 'Pornographic';

  const year = attributes.year ? String(attributes.year) : '';

  const demographics: string[] = [];
  const rawDemo = (attributes.publicationDemographic || '').toLowerCase();
  if (rawDemo === 'shounen') demographics.push('Shounen');
  else if (rawDemo === 'shoujo') demographics.push('Shoujo');
  else if (rawDemo === 'seinen') demographics.push('Seinen');
  else if (rawDemo === 'josei') demographics.push('Josei');

  const genres: string[] = [];
  const formats: string[] = [];
  const tags: string[] = [];

  if (Array.isArray(attributes.tags)) {
    for (const tag of attributes.tags) {
      const tagName = tag.attributes?.name?.en;
      if (!tagName) continue;

      const genreMatch = GENRES_LIST.find((g) => g.toLowerCase() === tagName.toLowerCase());
      if (genreMatch) {
        if (!genres.includes(genreMatch)) genres.push(genreMatch);
        continue;
      }

      const formatMatch = FORMATS_LIST.find((f) => f.toLowerCase() === tagName.toLowerCase());
      if (formatMatch) {
        if (!formats.includes(formatMatch)) formats.push(formatMatch);
        if (formatMatch === 'Long Strip' && type === 'Manga' && (langCode === 'ko' || langCode === 'zh')) {
          type = langCode === 'ko' ? 'Manhwa' : 'Manhua';
        }
        continue;
      }

      if (!tags.includes(tagName)) tags.push(tagName);
    }
  }

  // Cover URL: Use direct MangaDex cover upload URL
  const coverUrl = coverFileName ? `https://uploads.mangadex.org/covers/${id}/${coverFileName}` : undefined;

  // Rating from MangaDex Statistics API
  let rating: string | undefined;
  try {
    const statRes = await fetch(`https://api.mangadex.org/statistics/manga/${id}`, {
      headers: { 'User-Agent': 'VortexScans/1.0' },
    });
    if (statRes.ok) {
      const statJson = await statRes.json();
      const avg = statJson.statistics?.[id]?.rating?.average;
      if (typeof avg === 'number' && avg > 0) {
        rating = avg % 1 === 0 ? avg.toFixed(1) : avg.toFixed(2);
      }
    }
  } catch {}

  return {
    id,
    source: 'mangadex',
    title,
    alternateTitles,
    description,
    authors,
    artists,
    publishers: [],
    type,
    contentRating,
    status,
    year,
    originalLanguage,
    demographics,
    genres,
    formats,
    tags,
    coverUrl,
    rating,
    trackerUrl: `https://mangadex.org/title/${id}`,
  };
}

// 2. MangaBaka Import Handler
async function importFromMangaBaka(urlOrId: string): Promise<ImportedSeriesData> {
  const trimmed = urlOrId.trim();
  // Formats:
  // https://mangabaka.org/manhwa/4643/Chronicles-of-the-Demon-Faction
  // https://mangabaka.org/manga/4643
  // https://mangabaka.org/series/4643
  // 4643
  const idMatch = trimmed.match(/mangabaka\.(?:org|dev|com)\/(?:manhwa|manga|novel|series)\/(\d+)/i) ||
                  trimmed.match(/^(\d+)$/);

  let seriesId = idMatch ? idMatch[1] : '';

  // If URL has title slug instead of numeric ID in standard position:
  if (!seriesId) {
    const searchMatch = trimmed.match(/mangabaka\.(?:org|dev|com)\/(?:manhwa|manga|novel|series)\/([^/?#]+)/i);
    const query = searchMatch ? searchMatch[1].replace(/[-_]+/g, ' ') : trimmed;
    const searchRes = await fetch(`https://api.mangabaka.org/v1/series/search?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'VortexScans/1.0' },
    });
    if (searchRes.ok) {
      const searchJson = await searchRes.json();
      if (searchJson.data && searchJson.data.length > 0) {
        seriesId = String(searchJson.data[0].id);
      }
    }
  }

  if (!seriesId) {
    throw new Error(`Could not parse MangaBaka series ID from: ${trimmed}`);
  }

  const res = await fetch(`https://api.mangabaka.org/v1/series/${seriesId}`, {
    headers: {
      'User-Agent': 'VortexScans/1.0 (Mozilla/5.0)',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`MangaBaka API returned status ${res.status}`);
  }

  const json = await res.json();
  const d = json?.data;
  if (!d) {
    throw new Error('MangaBaka series data not found.');
  }

  const title = (d.title || d.romanized_title || d.native_title || '').trim();

  const alternateTitles: string[] = [];
  if (d.native_title && !alternateTitles.includes(d.native_title)) alternateTitles.push(d.native_title);
  if (d.romanized_title && !alternateTitles.includes(d.romanized_title)) alternateTitles.push(d.romanized_title);
  if (d.secondary_titles && typeof d.secondary_titles === 'object') {
    for (const val of Object.values(d.secondary_titles)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === 'string' && item.trim() && !alternateTitles.includes(item.trim())) {
            alternateTitles.push(item.trim());
          }
        }
      } else if (typeof val === 'string' && val.trim() && !alternateTitles.includes(val.trim())) {
        alternateTitles.push(val.trim());
      }
    }
  }

  const description = (d.description || '').replace(/\(Source:.*?\)/gi, '').trim();
  const authors: string[] = Array.isArray(d.authors) ? d.authors.map((a: any) => typeof a === 'string' ? a : a?.name || '').filter(Boolean) : [];
  const artists: string[] = Array.isArray(d.artists) ? d.artists.map((a: any) => typeof a === 'string' ? a : a?.name || '').filter(Boolean) : [];
  const publishers: string[] = Array.isArray(d.publishers) ? d.publishers.map((p: any) => typeof p === 'string' ? p : p?.name || '').filter(Boolean) : [];

  let type = 'Manga';
  const rawType = (d.type || '').toLowerCase();
  if (rawType === 'manhwa') type = 'Manhwa';
  else if (rawType === 'manhua') type = 'Manhua';
  else if (rawType === 'comic') type = 'Comic';
  else if (rawType === 'novel') type = 'Novel';

  let status = 'Releasing';
  const rawStatus = (d.status || '').toLowerCase();
  if (rawStatus === 'completed') status = 'Completed';
  else if (rawStatus === 'hiatus') status = 'Hiatus';
  else if (rawStatus === 'cancelled') status = 'Cancelled';

  let contentRating = 'Safe';
  const rawContent = (d.content_rating || '').toLowerCase();
  if (rawContent === 'suggestive') contentRating = 'Suggestive';
  else if (rawContent === 'erotica') contentRating = 'Erotica';
  else if (rawContent === 'pornographic') contentRating = 'Pornographic';

  const year = d.year ? String(d.year) : '';

  let originalLanguage = 'Japanese';
  const rawLang = (d.original_language || '').toLowerCase();
  if (rawLang === 'ko') originalLanguage = 'Korean';
  else if (rawLang === 'zh') originalLanguage = 'Chinese';
  else if (rawLang === 'en') originalLanguage = 'English';

  const genres: string[] = [];
  if (Array.isArray(d.genres)) {
    for (const g of d.genres) {
      const name = typeof g === 'string' ? g : g?.name;
      if (!name) continue;
      const clean = name.replace(/_/g, ' ');
      const match = GENRES_LIST.find((item) => item.toLowerCase() === clean.toLowerCase());
      if (match && !genres.includes(match)) genres.push(match);
      else if (!genres.includes(clean)) genres.push(clean.charAt(0).toUpperCase() + clean.slice(1));
    }
  }

  const tags: string[] = [];
  if (Array.isArray(d.tags)) {
    for (const t of d.tags) {
      const name = typeof t === 'string' ? t : t?.name;
      if (name && !tags.includes(name)) tags.push(name);
    }
  }

  // Cover image: prefer x350 or raw
  let coverUrl = d.cover?.x350?.x1 || d.cover?.raw?.url || d.cover?.x250?.x1;

  // Rating: MangaBaka is 0-100 scale, convert to 0-10 scale
  let rating: string | undefined;
  if (typeof d.rating === 'number' && d.rating > 0) {
    const r10 = d.rating / 10;
    rating = r10.toFixed(1);
  }

  // Outbound sources from MangaBaka links
  const sources: { name: string; url: string }[] = [];
  if (Array.isArray(d.links)) {
    for (const link of d.links) {
      if (typeof link === 'string' && link.startsWith('http')) {
        try {
          const parsed = new URL(link);
          let name = parsed.hostname.replace(/^www\./, '');
          if (name.includes('webtoons.com')) name = 'Webtoon';
          else if (name.includes('naver.com')) name = 'Naver';
          else if (name.includes('asuracomic') || name.includes('asurascans')) name = 'Asura';
          sources.push({ name, url: link });
        } catch {}
      }
    }
  }

  return {
    id: String(seriesId),
    source: 'mangabaka',
    title,
    alternateTitles,
    description,
    authors,
    artists,
    publishers,
    type,
    contentRating,
    status,
    year,
    originalLanguage,
    demographics: [],
    genres,
    formats: [],
    tags,
    coverUrl,
    rating,
    trackerUrl: `https://mangabaka.org/${seriesId}`,
    sources,
  };
}

// 3. MangaUpdates Import Handler
async function importFromMangaUpdates(urlOrId: string): Promise<ImportedSeriesData> {
  const trimmed = urlOrId.trim();
  let numericId: string | null = null;
  let slug = '';

  // Format 1: series.html?id=123456
  const queryMatch = trimmed.match(/series\.html\?id=(\d+)/i);
  if (queryMatch) {
    numericId = queryMatch[1];
  }

  // Format 2: /series/([a-z0-9]+)(?:/([^/?#]+))?
  const pathMatch = trimmed.match(/mangaupdates\.com\/series\/([a-z0-9]+)(?:\/([^/?#]+))?/i);
  if (pathMatch) {
    const rawCode = pathMatch[1];
    slug = pathMatch[2] || '';
    if (/^\d+$/.test(rawCode)) {
      numericId = rawCode;
    } else {
      try {
        const parsed = parseInt(rawCode, 36);
        if (!Number.isNaN(parsed) && parsed > 0) {
          numericId = String(parsed);
        }
      } catch {}
    }
  }

  // Format 3: Bare numeric or alphanumeric ID
  if (!numericId && !slug && /^[a-z0-9]+$/i.test(trimmed)) {
    if (/^\d+$/.test(trimmed)) {
      numericId = trimmed;
    } else {
      const parsed = parseInt(trimmed, 36);
      if (!Number.isNaN(parsed) && parsed > 0) {
        numericId = String(parsed);
      }
    }
  }

  let detail: any = null;

  // Try direct ID fetch first
  if (numericId) {
    try {
      const res = await fetch(`https://api.mangaupdates.com/v1/series/${numericId}`, {
        headers: {
          'User-Agent': 'VortexScans/1.0 (contact@vortexscans.org)',
          Accept: 'application/json',
        },
      });
      if (res.ok) {
        detail = await res.json();
      }
    } catch {}
  }

  // Fallback: If ID lookup failed or 404'd, search by slug / title
  if (!detail && slug) {
    try {
      const searchTitle = slug.replace(/[-_]+/g, ' ').trim();
      const searchRes = await fetch('https://api.mangaupdates.com/v1/series/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VortexScans/1.0 (contact@vortexscans.org)',
        },
        body: JSON.stringify({ search: searchTitle, stype: 'title' }),
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const firstHit = searchData.results?.[0]?.record;
        if (firstHit?.series_id) {
          const detailRes = await fetch(`https://api.mangaupdates.com/v1/series/${firstHit.series_id}`, {
            headers: {
              'User-Agent': 'VortexScans/1.0 (contact@vortexscans.org)',
              Accept: 'application/json',
            },
          });
          if (detailRes.ok) {
            detail = await detailRes.json();
          }
        }
      }
    } catch {}
  }

  if (!detail) {
    throw new Error('Unable to find series on MangaUpdates. Please verify the URL or ID.');
  }

  const title = (detail.title || '').trim();
  const alternateTitles: string[] = [];
  if (Array.isArray(detail.associated)) {
    for (const a of detail.associated) {
      const alt = a.title?.trim();
      if (alt && !alternateTitles.includes(alt) && alt !== title) {
        alternateTitles.push(alt);
      }
    }
  }

  const description = (detail.description || '').trim();

  const authors: string[] = [];
  const artists: string[] = [];
  if (Array.isArray(detail.authors)) {
    for (const a of detail.authors) {
      const name = (a.name || '').trim();
      if (!name) continue;
      if (a.type === 'Artist') {
        if (!artists.includes(name)) artists.push(name);
      } else {
        if (!authors.includes(name)) authors.push(name);
      }
    }
  }

  const publishers: string[] = [];
  if (Array.isArray(detail.publishers)) {
    for (const p of detail.publishers) {
      const pub = (p.publisher_name || '').trim();
      if (pub && !publishers.includes(pub)) publishers.push(pub);
    }
  }

  let type = detail.type || 'Manga';
  if (type === 'Webtoon') type = 'Manhwa';

  // Content rating derivation
  let contentRating = 'Safe';
  const allGenreCatNames = [
    ...(detail.genres?.map((g: any) => g.genre) || []),
    ...(detail.categories?.map((c: any) => c.category) || []),
  ].map((s: string) => String(s).toLowerCase());

  if (allGenreCatNames.some((c: string) => c.includes('hentai') || c.includes('pornographic'))) {
    contentRating = 'Pornographic';
  } else if (allGenreCatNames.some((c: string) => c.includes('adult') || c.includes('mature') || c.includes('smut'))) {
    contentRating = 'Erotica';
  } else if (allGenreCatNames.some((c: string) => c.includes('ecchi') || c.includes('suggestive'))) {
    contentRating = 'Suggestive';
  }

  // Status mapping
  const rawStatus = (detail.status || '').toLowerCase();
  let status = 'Releasing';
  if (rawStatus.includes('complete')) status = 'Completed';
  else if (rawStatus.includes('hiatus')) status = 'Hiatus';
  else if (rawStatus.includes('cancel')) status = 'Cancelled';

  const year = detail.year ? String(detail.year).trim() : '';

  let originalLanguage = 'Japanese';
  if (type === 'Manhwa') originalLanguage = 'Korean';
  else if (type === 'Manhua') originalLanguage = 'Chinese';
  else if (type === 'Comic') originalLanguage = 'English';

  const demographics: string[] = [];
  const rawDemos = ['Shounen', 'Shoujo', 'Seinen', 'Josei'];
  for (const g of detail.genres || []) {
    const match = rawDemos.find((d) => d.toLowerCase() === g.genre?.toLowerCase());
    if (match && !demographics.includes(match)) demographics.push(match);
  }

  const genres: string[] = [];
  for (const g of detail.genres || []) {
    const match = GENRES_LIST.find((gl) => gl.toLowerCase() === g.genre?.toLowerCase());
    if (match && !genres.includes(match)) genres.push(match);
  }

  const tags: string[] = [];
  for (const c of detail.categories || []) {
    const cat = (c.category || '').trim();
    if (cat && !tags.includes(cat) && !genres.includes(cat) && !demographics.includes(cat)) {
      tags.push(cat);
    }
  }

  const coverUrl = detail.image?.url?.original || detail.image?.url?.thumb || undefined;

  let rating: string | undefined;
  if (typeof detail.bayesian_rating === 'number' && detail.bayesian_rating > 0) {
    rating = detail.bayesian_rating.toFixed(1);
  }

  const trackerUrl = detail.url || (numericId ? `https://www.mangaupdates.com/series/${Number(numericId).toString(36)}` : trimmed);

  const sources: { name: string; url: string }[] = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(detail.description || '')) !== null) {
    const name = match[1].trim();
    const url = match[2].trim();
    if (!url.includes('mangaupdates.com') && !sources.some((s) => s.url === url)) {
      sources.push({ name, url });
    }
  }

  return {
    id: String(detail.series_id || numericId || ''),
    source: 'mangaupdates',
    title,
    alternateTitles,
    description,
    authors,
    artists,
    publishers,
    type,
    contentRating,
    status,
    year,
    originalLanguage,
    demographics,
    genres,
    formats: [],
    tags: tags.slice(0, 20),
    coverUrl,
    rating,
    trackerUrl,
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
    let inputUrl = '';
    if (request.method === 'POST') {
      let body = request.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch {}
      }
      inputUrl = body?.url || '';
    } else {
      const url = new URL(request.url || '', 'http://localhost');
      inputUrl = url.searchParams.get('url') || '';
    }

    if (!inputUrl.trim()) {
      response.status(400).json({ error: 'Please provide a MangaDex, MangaBaka, or MangaUpdates URL.' });
      return;
    }

    const trimmed = inputUrl.trim();
    let result: ImportedSeriesData;

    if (trimmed.includes('mangabaka.')) {
      result = await importFromMangaBaka(trimmed);
    } else if (trimmed.includes('mangaupdates.')) {
      result = await importFromMangaUpdates(trimmed);
    } else {
      result = await importFromMangaDex(trimmed);
    }

    response.status(200).json({ success: true, data: result });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Import failed.';
    response.status(500).json({ success: false, error: message });
  }
}
