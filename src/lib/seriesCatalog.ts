import { supabase } from './supabase';
import { getEarlyBirdSource, getWinningChapterSource } from './sourcePriority';

export type SeriesChapter = {
  title: string;
  href: string;
  status: string;
  locked?: boolean;
  createdAt?: string;
  sourceName?: string;
};

export type SeriesLink = {
  name: string;
  url: string;
  logo?: string;
  isSample?: boolean;
  latestChapterNumber?: string;
  latestChapterAt?: string;
  rating?: string;
};

export type SeriesRecord = {
  id: number;
  slug: string;
  title: string;
  href: string;
  cover: string;
  category: string;
  rating: string | null;
  status: string;
  pinned: boolean;
  isNew?: boolean;
  chapters: SeriesChapter[];
  alternateTitles: string[];
  synopsis: string | null;
  author: string | null;
  artist: string | null;
  publishers: string[];
  contentRating: string | null;
  year: number | null;
  originalLanguage: string | null;
  demographics: string[];
  genres: string[];
  formats: string[];
  tags: string[];
  trackers: SeriesLink[];
  sources: SeriesLink[];
  facts: Record<string, string | null>;
  favorites: string | null;
  views?: number;
  reviewCount: number | null;
  pageNumber: number;
  pageOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateSeriesRequest = {
  title: string;
  cover?: string;
  category?: string;
  rating?: string;
  status?: string;
  isNew?: boolean;
  synopsis?: string;
  alternateTitles?: string[];
  author?: string;
  artist?: string;
  publishers?: string[];
  contentRating?: string;
  year?: number;
  originalLanguage?: string;
  demographics?: string[];
  genres?: string[];
  formats?: string[];
  tags?: string[];
  trackers?: SeriesLink[];
  sources?: SeriesLink[];
  chapters?: SeriesChapter[];
  facts?: Record<string, string | null>;
};

export type SeriesCatalogResponse = {
  totalCount: number;
  items: SeriesRecord[];
};

export type SeriesCatalogPageOptions = {
  page: number;
  pageSize: number;
  search?: string;
  categories?: string[];
  statuses?: string[];
  sources?: string[];
  sortOrder?: 'newest' | 'oldest';
};

export type NewSeriesCatalogIndexItem = { id: number; createdAt: string };
export type HomeNewSeriesIndexItem = { id: number; slug: string; title: string; createdAt: string; isNew: boolean };
export type SeriesBrowseFacets = { genres: string[]; categories: string[] };
export type SeriesBrowsePageOptions = {
  page: number;
  pageSize: number;
  search?: string;
  statuses?: string[];
  categories?: string[];
  includeGenres?: string[];
  excludeGenres?: string[];
  minChapters?: number | null;
  maxChapters?: number | null;
  createdAfter?: string | null;
  createdBefore?: string | null;
  availability?: string;
  sort?: string;
  direction?: 'asc' | 'desc';
};
export type SeriesRecommendation = Pick<SeriesRecord, 'title' | 'href' | 'cover' | 'rating'> & {
  chapterCount: number | null;
};


export const SERIES_CATALOG_QUERY_KEY = ['series-catalog'] as const;

export const DEFAULT_SERIES_COVER = '/nocover.jpg';


type SeriesDatabaseRow = {
  id: number;
  slug: string;
  title: string;
  href: string;
  cover: string;
  category: string;
  rating: string | null;
  status: string;
  pinned: boolean;
  chapters: SeriesChapter[] | null;
  alternate_titles: string[] | null;
  synopsis: string | null;
  author: string | null;
  artist: string | null;
  publishers: string[] | null;
  content_rating: string | null;
  year: number | null;
  original_language: string | null;
  demographics: string[] | null;
  genres: string[] | null;
  formats: string[] | null;
  tags: string[] | null;
  trackers: SeriesLink[] | null;
  sources: SeriesLink[] | null;
  facts: Record<string, string | null> | null;
  favorites: string | number | null;
  views?: number | null;
  review_count: number | null;
  page_number: number;
  page_order: number;
  created_at: string;
  updated_at: string;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

export function getHighestSeriesRating(
  explicitRating?: string | number | null,
  sources?: SeriesLink[] | null,
  trackers?: SeriesLink[] | null,
): string | null {
  const ratings: number[] = [];
  if (explicitRating !== null && explicitRating !== undefined && String(explicitRating).trim()) {
    const num = parseFloat(String(explicitRating));
    if (!Number.isNaN(num) && num > 0) ratings.push(num);
  }
  if (Array.isArray(sources)) {
    for (const s of sources) {
      if (s?.rating) {
        const num = parseFloat(String(s.rating));
        if (!Number.isNaN(num) && num > 0) ratings.push(num);
      }
    }
  }
  if (Array.isArray(trackers)) {
    for (const t of trackers) {
      if (t?.rating) {
        const num = parseFloat(String(t.rating));
        if (!Number.isNaN(num) && num > 0) ratings.push(num);
      }
    }
  }
  if (ratings.length === 0) return null;
  const max = Math.max(...ratings);
  return max % 1 === 0 ? max.toFixed(1) : String(max);
}

function toSeriesRecord(value: unknown): SeriesRecord {
  const row = value as SeriesDatabaseRow;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    href: row.href,
    cover: row.cover ?? '',
    category: row.category || (row.facts?.type as string | null | undefined) || 'Manhwa',
    rating: getHighestSeriesRating(row.rating, row.sources, row.trackers),
    status: row.status ?? 'Ongoing',
    pinned: row.pinned ?? false,
    isNew: row.facts?.is_new !== undefined ? String(row.facts.is_new).toLowerCase() === 'true' : false,
    chapters: (() => {
      if (Array.isArray(row.chapters) && row.chapters.length > 0) {
        return row.chapters;
      }
      const highestNum = row.facts?.latest_chapter_number || row.facts?.last_chapter_number;
      if (highestNum) {
        const cleanNum = String(highestNum).replace(/^ch(?:apter)?\.?\s*/i, '').trim();
        const chSlug = slugify(`chapter-${cleanNum}`);
        return [
          {
            title: `Chapter ${cleanNum}`,
            href: `/series/${row.slug || slugify(row.title)}/${chSlug}`,
            status: 'New',
          },
        ];
      }
      return [];
    })(),
    alternateTitles: row.alternate_titles ?? [],
    synopsis: row.synopsis,
    author: row.author,
    artist: row.artist,
    publishers: row.publishers ?? [],
    contentRating: row.content_rating,
    year: row.year,
    originalLanguage: row.original_language,
    demographics: row.demographics ?? [],
    genres: row.genres ?? [],
    formats: row.formats ?? [],
    tags: row.tags ?? [],
    trackers: row.trackers ?? [],
    sources: row.sources ?? [],
    facts: row.facts ?? {},
    favorites: row.favorites == null ? null : String(row.favorites),
    views: typeof row.views === 'number' ? row.views : Number(row.views) || 0,
    reviewCount: row.review_count,
    pageNumber: row.page_number,
    pageOrder: row.page_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugFromHref(href: string, title: string) {
  const rawSlug = href.match(/^\/series\/([^/?#]+)/i)?.[1];
  if (rawSlug) {
    try {
      return decodeURIComponent(rawSlug).toLocaleLowerCase();
    } catch {
      return rawSlug.toLocaleLowerCase();
    }
  }
  return slugify(title);
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function parseChapterAgeMinutes(status?: string | null): number | null {
  const s = (status || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'just now' || s === 'new') return 0;
  if (s === 'today') return 720;
  if (s === 'yesterday') return 1440;

  const minMatch = s.match(/(\d+)\s*(?:m|min(?:ute)?s?)(?:\s*ago)?/);
  if (minMatch) return Number(minMatch[1]);

  const hourMatch = s.match(/(\d+)\s*(?:h|hour|hr)s?(?:\s*ago)?/);
  if (hourMatch) return Number(hourMatch[1]) * 60;

  const dayMatch = s.match(/(\d+)\s*(?:d|days?)(?:\s*ago)?/);
  if (dayMatch) return Number(dayMatch[1]) * 1440;

  const weekMatch = s.match(/(\d+)\s*(?:w|weeks?)(?:\s*ago)?/);
  if (weekMatch) return Number(weekMatch[1]) * 1440 * 7;

  const monthMatch = s.match(/(\d+)\s*(?:mo|months?)(?:\s*ago)?/);
  if (monthMatch) return Number(monthMatch[1]) * 1440 * 30;

  const parsedDate = Date.parse(s);
  if (!Number.isNaN(parsedDate)) {
    const diffMin = (Date.now() - parsedDate) / (1000 * 60);
    if (diffMin >= 0) return diffMin;
  }

  return null;
}

function parseExplicitOrRelativeTimestamp(value?: string | null): number {
  if (!value) return 0;
  const raw = String(value).trim();
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;
  const ageMinutes = parseChapterAgeMinutes(raw);
  if (ageMinutes !== null) return Date.now() - ageMinutes * 60 * 1000;
  return 0;
}

export function getSeriesReleaseTimestamp(item: Pick<SeriesRecord, 'sources' | 'facts' | 'chapters' | 'createdAt'>): number {
  // 1. Early bird source latest chapter timestamp (first to upload the latest chapter)
  const earlyBirdSource = getEarlyBirdSource(item.sources, item.facts?.latest_source_url || undefined);
  if (earlyBirdSource?.latestChapterAt) {
    const ts = parseExplicitOrRelativeTimestamp(earlyBirdSource.latestChapterAt);
    if (ts > 0) return ts;
  }

  const timestamps: number[] = [];

  // Fallback to winning source latest chapter timestamp
  const winningSource = getWinningChapterSource(item.sources, item.facts?.latest_source_url || undefined);
  if (winningSource?.latestChapterAt) {
    const ts = parseExplicitOrRelativeTimestamp(winningSource.latestChapterAt);
    if (ts > 0) timestamps.push(ts);
  }

  // 2. Facts dates
  if (item.facts?.last_chapter_added_at) {
    const ts = parseExplicitOrRelativeTimestamp(item.facts.last_chapter_added_at);
    if (ts > 0) timestamps.push(ts);
  }
  const factUpdate = item.facts?.lastUpdate || item.facts?.['Last update'];
  if (factUpdate) {
    const ts = parseExplicitOrRelativeTimestamp(factUpdate);
    if (ts > 0) timestamps.push(ts);
  }

  // 3. Chapter[0] createdAt / date
  const latestChapter = Array.isArray(item.chapters) ? item.chapters[0] : null;
  if (latestChapter) {
    const explicitDate = (latestChapter as any).createdAt || (latestChapter as any).created_at || (latestChapter as any).date || (latestChapter as any).releasedAt;
    if (explicitDate) {
      const ts = parseExplicitOrRelativeTimestamp(explicitDate);
      if (ts > 0) timestamps.push(ts);
    }
  }

  // If any confirmed timestamps exist, the latest confirmed release date wins
  if (timestamps.length > 0) {
    return Math.max(...timestamps);
  }

  // 4. Relative chapter status (e.g. "3d ago") if valid
  if (latestChapter?.status) {
    const s = latestChapter.status.trim().toLowerCase();
    if (!['new', 'just now'].includes(s)) {
      const relMin = parseChapterAgeMinutes(latestChapter.status);
      if (relMin !== null) return Date.now() - relMin * 60 * 1000;
    }
  }

  // 5. Fallback only if the series actually has chapters or chapter sources
  const hasChapters = (Array.isArray(item.chapters) && item.chapters.length > 0) || Boolean(winningSource?.latestChapterNumber);
  if (hasChapters && item.createdAt) {
    const t = Date.parse(item.createdAt);
    if (!Number.isNaN(t)) return t;
  }

  return 0;
}

export function getSeriesReleaseAgeMinutes(item: SeriesRecord): number {
  const ts = getSeriesReleaseTimestamp(item);
  if (ts > 0) {
    return Math.max(0, (Date.now() - ts) / (1000 * 60));
  }
  return Number.POSITIVE_INFINITY;
}

export function getSeriesCreatedTimestamp(item: Pick<SeriesRecord, 'createdAt' | 'id'>): number {
  if (item.createdAt) {
    const t = Date.parse(item.createdAt);
    if (!Number.isNaN(t)) return t;
  }
  return (item.id || 0) * 1000;
}

const CATALOG_CACHE_KEY = 'vortex-series-catalog-cache';

let inFlightCatalogPromise: Promise<SeriesCatalogResponse> | null = null;
let lastCatalogFetchedAt = 0;
let inMemoryCatalog: SeriesCatalogResponse | null = null;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory cache to prevent redundant Supabase queries

export function invalidateCatalogCache(): void {
  inMemoryCatalog = null;
  lastCatalogFetchedAt = 0;
}

export function getCachedSeriesCatalog(): SeriesCatalogResponse | null {
  if (inMemoryCatalog && Array.isArray(inMemoryCatalog.items) && inMemoryCatalog.items.length > 0) {
    return inMemoryCatalog;
  }
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      inMemoryCatalog = parsed as SeriesCatalogResponse;
      return inMemoryCatalog;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function cacheSeriesCatalog(data: SeriesCatalogResponse): void {
  inMemoryCatalog = data;
  lastCatalogFetchedAt = Date.now();
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

export async function getSeriesCatalog(forceRefresh?: boolean | unknown): Promise<SeriesCatalogResponse> {
  const isForce = typeof forceRefresh === 'boolean' ? forceRefresh : false;
  const now = Date.now();
  if (!isForce && inMemoryCatalog && (now - lastCatalogFetchedAt < CATALOG_CACHE_TTL_MS)) {
    return inMemoryCatalog;
  }

  if (!isForce && inFlightCatalogPromise) {
    return inFlightCatalogPromise;
  }

  if (!isForce && !inMemoryCatalog) {
    const cached = getCachedSeriesCatalog();
    if (cached) {
      inMemoryCatalog = cached;
      lastCatalogFetchedAt = now;
      return cached;
    }
  }

  inFlightCatalogPromise = (async () => {
    try {
      const client = requireSupabase();
      const { data, error } = await client
        .from('series')
        .select(
          'id, slug, title, href, cover, category, rating, status, pinned, chapters, ' +
          'alternate_titles, synopsis, author, artist, publishers, content_rating, year, ' +
          'original_language, demographics, genres, formats, tags, trackers, sources, ' +
          'facts, favorites, views, review_count, page_number, page_order, created_at, updated_at',
        )
        .order('page_number', { ascending: true })
        .order('page_order', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      const items = (data ?? []).map(toSeriesRecord);
      const result = { totalCount: items.length, items };
      cacheSeriesCatalog(result);
      return result;
    } finally {
      inFlightCatalogPromise = null;
    }
  })();

  return inFlightCatalogPromise;
}

export async function getSeriesCatalogPage(options: SeriesCatalogPageOptions): Promise<SeriesCatalogResponse> {
  const client = requireSupabase();
  const from = Math.max(0, options.page - 1) * options.pageSize;
  const to = from + options.pageSize - 1;
  let request = client
    .from('series')
    .select(
      'id, slug, title, href, cover, category, rating, status, pinned, chapters, ' +
      'alternate_titles, synopsis, author, artist, publishers, content_rating, year, ' +
      'original_language, demographics, genres, formats, tags, trackers, sources, ' +
      'facts, favorites, views, review_count, page_number, page_order, created_at, updated_at',
      { count: 'exact' },
    );

  const orConditions: string[] = [];
  const search = options.search?.trim();
  if (search) {
    const escaped = search.replace(/[\\%_,()]/g, (character) => `\\${character}`);
    const exactAlternateTitle = JSON.stringify(search).replace(/,/g, '\\,');
    orConditions.push(`or(title.ilike.%${escaped}%,slug.ilike.%${escaped}%,alternate_titles.cs.{${exactAlternateTitle}})`);
  }
  if (options.categories?.length) request = request.in('category', options.categories);
  if (options.statuses?.length) request = request.in('status', options.statuses);
  if (options.sources?.length) {
    const sourceFilters = options.sources.map((name) => {
      const jsonName = JSON.stringify(name.trim()).replace(/,/g, '\\,');
      return `sources.cs.[{"name":${jsonName}}]`;
    });
    orConditions.push(`or(${sourceFilters.join(',')})`);
  }
  if (orConditions.length === 1) request = request.or(orConditions[0]);
  else if (orConditions.length > 1) request = request.or(`and(${orConditions.join(',')})`);

  const { data, error, count } = await request
    .order('created_at', { ascending: options.sortOrder === 'oldest' })
    .order('id', { ascending: options.sortOrder === 'oldest' })
    .range(from, to);

  if (error) {
    console.error('getSeriesCatalogPage error:', error.message || error);
    throw error;
  }
  return { totalCount: count ?? 0, items: (data ?? []).map(toSeriesRecord) };
}

export async function getNewSeriesCatalogIndex(): Promise<NewSeriesCatalogIndexItem[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('series')
    .select('id, created_at')
    .eq('facts->>is_new', 'true')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((item) => ({ id: item.id, createdAt: item.created_at }));
}

export async function getSeriesBrowseFacets(): Promise<SeriesBrowseFacets> {
  const cached = inMemoryCatalog ?? getCachedSeriesCatalog();
  const items = cached ? cached.items : (await getSeriesCatalog()).items;
  const genres = new Set<string>();
  const categories = new Set<string>();
  for (const row of items) {
    for (const genre of row.genres ?? []) if (typeof genre === 'string' && genre.trim()) genres.add(genre.trim());
    const category = row.category;
    if (typeof category === 'string' && category.trim()) categories.add(category.trim());
  }
  return { genres: [...genres].sort((a, b) => a.localeCompare(b)), categories: [...categories].sort((a, b) => a.localeCompare(b)) };
}

// Normalise a genre/tag string for case-insensitive comparison.
// Robust chapter number parser matching the card display
function parseChapterNumber(value?: string | number | null): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  const str = String(value).trim();
  if (!str) return 0;

  // 1. Strip leading "Chapter", "Ch.", "Episode", "Ep." and extract leading number
  const cleaned = str.replace(/^(?:chapter|ch|episode|ep)\.?\s*/i, '').trim();
  const leadingMatch = cleaned.match(/^(\d+(?:\.\d+)?)/);
  if (leadingMatch) {
    const num = Number.parseFloat(leadingMatch[1]);
    if (Number.isFinite(num)) return num;
  }

  // 2. Look for explicit "Ch. XX" or "Chapter XX" anywhere in the string
  const chMatch = str.match(/ch(?:apter)?\.?\s*(\d+(?:\.\d+)?)/i);
  if (chMatch) {
    const num = Number.parseFloat(chMatch[1]);
    if (Number.isFinite(num)) return num;
  }

  return 0;
}

// Calculate the canonical latest chapter number that is displayed on the series card
export function getSeriesChapterCount(item: Pick<SeriesRecord, 'sources' | 'facts' | 'chapters'>): number {
  // Use the exact priority logic as LatestReleaseCard:
  // 1. Early Bird source's latest chapter number (first to upload the latest chapter)
  const earlyBird = getEarlyBirdSource(item.sources, item.facts?.latest_source_url || undefined);
  const earlyBirdNum = parseChapterNumber(earlyBird?.latestChapterNumber);
  if (earlyBirdNum > 0) return earlyBirdNum;

  // Fallback to winning source
  const winning = getWinningChapterSource(item.sources, item.facts?.latest_source_url || undefined);
  const winningNum = parseChapterNumber(winning?.latestChapterNumber);
  if (winningNum > 0) return winningNum;

  // 2. Facts latest/last chapter number
  const factNum = parseChapterNumber(item.facts?.latest_chapter_number || item.facts?.last_chapter_number);
  if (factNum > 0) return factNum;

  // 3. First chapter title (newest chapter)
  const firstChNum = parseChapterNumber(item.chapters?.[0]?.title);
  if (firstChNum > 0) return firstChNum;

  // 4. Fallback to length of chapters array
  return Array.isArray(item.chapters) ? item.chapters.length : 0;
}

// Normalize a genre or tag string for case and symbol agnostic comparison
function normalizeGenre(value: string): string {
  return value.trim().toLocaleLowerCase();
}

// Identify whether a filter tag represents a 100+ chapter count condition
function is100PlusChapterTag(genre: string): boolean {
  const norm = normalizeGenre(genre).replace(/[\s\-_]+/g, '');
  return (
    norm === '+100chapter' ||
    norm === '+100chapters' ||
    norm === '100+chapter' ||
    norm === '100+chapters' ||
    norm === '100+ch' ||
    norm === '+100ch' ||
    norm === '100+' ||
    norm === '+100'
  );
}

// Test whether a series matches a given genre filter
function seriesMatchesGenre(item: SeriesRecord, genre: string): boolean {
  // If the user selected the "+100 Chapter" tag, it MUST strictly have >= 100 chapters
  if (is100PlusChapterTag(genre)) {
    return getSeriesChapterCount(item) >= 100;
  }

  const norm = normalizeGenre(genre);
  const cleanNorm = norm.replace(/[\s\-_]+/g, '');

  // Check genres
  const inGenres = (item.genres ?? []).some((g) => {
    const gNorm = normalizeGenre(g);
    return gNorm === norm || gNorm.replace(/[\s\-_]+/g, '') === cleanNorm;
  });
  if (inGenres) return true;

  // Check tags
  const inTags = (item.tags ?? []).some((t) => {
    const tNorm = normalizeGenre(t);
    return tNorm === norm || tNorm.replace(/[\s\-_]+/g, '') === cleanNorm;
  });
  if (inTags) return true;

  return false;
}

// Apply all browse filters client-side on a full result set.
export function applyBrowseFiltersClientSide(
  items: SeriesRecord[],
  options: SeriesBrowsePageOptions,
): SeriesRecord[] {
  const includeGenres = options.includeGenres ?? [];
  const excludeGenres = options.excludeGenres ?? [];
  const statusesNorm = (options.statuses ?? []).map((s) => s.trim().toLocaleLowerCase());
  const categoriesNorm = (options.categories ?? []).map((c) => c.trim().toLocaleLowerCase());
  const search = options.search?.trim().toLocaleLowerCase() ?? '';
  const minCh = options.minChapters ?? null;
  const maxCh = options.maxChapters ?? null;
  const createdAfterMs = options.createdAfter ? Date.parse(options.createdAfter) : null;
  const createdBeforeMs = options.createdBefore ? Date.parse(options.createdBefore) : null;

  return items.filter((item) => {
    // Search in title, slug, alternate titles, author, artist
    if (search) {
      const inTitle = item.title.toLocaleLowerCase().includes(search);
      const inSlug = item.slug.toLocaleLowerCase().includes(search);
      const inAlt = (item.alternateTitles ?? []).some((t) => t.toLocaleLowerCase().includes(search));
      const inAuthor = Boolean(item.author && item.author.toLocaleLowerCase().includes(search));
      const inArtist = Boolean(item.artist && item.artist.toLocaleLowerCase().includes(search));
      if (!inTitle && !inSlug && !inAlt && !inAuthor && !inArtist) return false;
    }

    // Status filter
    if (statusesNorm.length > 0) {
      const itemStatus = item.status.trim().toLocaleLowerCase();
      const matches = statusesNorm.some((s) => {
        if (s === itemStatus) return true;
        if (s === 'ongoing' && ['ongoing', 'releasing'].includes(itemStatus)) return true;
        return false;
      });
      if (!matches) return false;
    }

    // Category / type filter
    if (categoriesNorm.length > 0) {
      const itemCategory = item.category.trim().toLocaleLowerCase();
      if (!categoriesNorm.includes(itemCategory)) return false;
    }

    // Genre include filter — series must match ALL included genres
    if (includeGenres.length > 0) {
      const hasAll = includeGenres.every((g) => seriesMatchesGenre(item, g));
      if (!hasAll) return false;
    }

    // Genre exclude filter — series must NOT match any excluded genre
    if (excludeGenres.length > 0) {
      const hasAny = excludeGenres.some((g) => seriesMatchesGenre(item, g));
      if (hasAny) return false;
    }

    // Chapter count filter
    if (minCh !== null || maxCh !== null) {
      const count = getSeriesChapterCount(item);
      if (minCh !== null && count < minCh) return false;
      if (maxCh !== null && count > maxCh) return false;
    }

    // Created date filter
    if (createdAfterMs !== null || createdBeforeMs !== null) {
      const createdMs = Date.parse(item.createdAt);
      if (Number.isFinite(createdMs)) {
        if (createdAfterMs !== null && createdMs < createdAfterMs) return false;
        if (createdBeforeMs !== null && createdMs > createdBeforeMs) return false;
      }
    }

    return true;
  });
}

// Sort a filtered result set client-side, mirroring the RPC sort options.
export function sortBrowseResultsClientSide(
  items: SeriesRecord[],
  sort: string,
  direction: 'asc' | 'desc',
): SeriesRecord[] {
  const asc = direction === 'asc';
  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case 'title':
        cmp = a.title.localeCompare(b.title);
        break;
      case 'popular':
        cmp = (Number(parseFloat(b.rating ?? '0')) || 0) - (Number(parseFloat(a.rating ?? '0')) || 0);
        break;
      case 'newest':
        cmp = Date.parse(b.createdAt) - Date.parse(a.createdAt);
        break;
      case 'oldest':
        cmp = Date.parse(a.createdAt) - Date.parse(b.createdAt);
        break;
      case 'chapters': {
        cmp = getSeriesChapterCount(b) - getSeriesChapterCount(a);
        break;
      }
      case 'updated':
      case 'latest':
      default:
        cmp = getSeriesReleaseTimestamp(b) - getSeriesReleaseTimestamp(a);
        break;
    }
    return asc && sort !== 'oldest' && sort !== 'newest' ? -cmp : cmp;
  });
}

export async function getSeriesBrowsePage(options: SeriesBrowsePageOptions): Promise<{ totalCount: number; items: SeriesRecord[] }> {
  // Reuse the cached/deduplicated catalog so browsing and paginating causes 0 extra Supabase egress
  const catalog = await getSeriesCatalog();
  const allItems = catalog.items;

  // Apply accurate client-side filtering (genres, tags, chapter count, dates)
  let filtered = applyBrowseFiltersClientSide(allItems, options);

  // Sort accurately using canonical client-side algorithms (strictly matches displayed card timestamps & chapter numbers)
  filtered = sortBrowseResultsClientSide(filtered, options.sort ?? 'latest', options.direction ?? 'desc');

  // Paginate
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? 36);
  const from = (page - 1) * pageSize;
  const pageItems = filtered.slice(from, from + pageSize);

  return { totalCount: filtered.length, items: pageItems };
}

export type SiteSearchCatalogItem = { title: string; href: string; cover: string; category: string; searchText?: string };

export async function getSiteSearchHighlights(limit = 4): Promise<SiteSearchCatalogItem[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('series')
    .select('title, href, cover, category')
    .order('pinned', { ascending: false })
    .order('rating', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    title: row.title,
    href: row.href,
    cover: row.cover ?? '',
    category: row.category ?? 'Manhwa',
  }));
}

export async function searchSiteCatalog(search: string, limit = 4): Promise<{ items: SiteSearchCatalogItem[]; totalCount: number }> {
  const client = requireSupabase();
  const escaped = search.trim().replace(/[\\%_,()]/g, (character) => `\\${character}`);
  const { data, error, count } = await client.from('series')
    .select('title, href, cover, category', { count: 'exact' })
    .or(`title.ilike.%${escaped}%,slug.ilike.%${escaped}%,category.ilike.%${escaped}%`)
    .order('title', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return {
    totalCount: count ?? 0,
    items: (data ?? []).map((row) => ({
      title: row.title,
      href: row.href,
      cover: row.cover ?? '',
      category: row.category ?? 'Manhwa',
    })),
  };
}

export async function getHomeNewSeriesIndex(): Promise<HomeNewSeriesIndexItem[]> {
  const client = requireSupabase();
  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('series')
    .select('id, slug, title, created_at, facts')
    .or([
      'facts->>is_new.eq.true',
      `and(facts->>is_new.neq.false,facts->>last_chapter_added_at.gte.${recentCutoff})`,
      `and(facts->>is_new.is.null,facts->>last_chapter_added_at.gte.${recentCutoff})`,
      `and(facts->>is_new.is.null,created_at.gte.${recentCutoff})`,
    ].join(','))
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    createdAt: item.created_at,
    isNew: String(item.facts?.is_new ?? '').toLowerCase() === 'true',
  }));
}

export async function getSeriesCatalogByIds(ids: number[]): Promise<SeriesRecord[]> {
  if (ids.length === 0) return [];
  const cached = inMemoryCatalog ?? getCachedSeriesCatalog();
  if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
    const byId = new Map(cached.items.map((item) => [item.id, item]));
    if (ids.every((id) => byId.has(id))) {
      return ids.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
    }
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('series')
    .select(
      'id, slug, title, href, cover, category, rating, status, pinned, chapters, ' +
      'alternate_titles, synopsis, author, artist, publishers, content_rating, year, ' +
      'original_language, demographics, genres, formats, tags, trackers, sources, ' +
      'facts, favorites, views, review_count, page_number, page_order, created_at, updated_at',
    )
    .in('id', ids);
  if (error) throw error;
  const rows = (data ?? []) as unknown as SeriesDatabaseRow[];
  const byId = new Map(rows.map((item) => [item.id, toSeriesRecord(item)] as const));
  return ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

export async function getSeriesCatalogCount(): Promise<number> {
  const client = requireSupabase();
  const { count, error } = await client.from('series').select('id', { count: 'exact', head: true });
  if (error) {
    console.error('getSeriesCatalogCount error:', error.message || error);
    throw error;
  }
  return count ?? 0;
}

export async function getSeriesCatalogCoverSamples(): Promise<string[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('series')
    .select('cover')
    .not('cover', 'is', null)
    .neq('cover', '')
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []).map((item) => item.cover).filter((cover): cover is string => !!cover);
}

export async function getHomeCatalogHighlights(limit = 60): Promise<SeriesRecord[]> {
  const cached = inMemoryCatalog ?? getCachedSeriesCatalog();
  if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
    return [...cached.items]
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const ratingA = parseFloat(a.rating ?? '0') || 0;
        const ratingB = parseFloat(b.rating ?? '0') || 0;
        if (ratingB !== ratingA) return ratingB - ratingA;
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      })
      .slice(0, limit);
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('series')
    .select(
      'id, slug, title, href, cover, category, rating, status, pinned, ' +
      'alternate_titles, author, artist, genres, formats, tags, sources, ' +
      'facts, favorites, views, page_number, page_order, created_at, updated_at',
    )
    .order('pinned', { ascending: false })
    .order('rating', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toSeriesRecord);
}

export async function getSeriesRecommendations(
  currentSeries: Pick<SeriesRecord, 'id' | 'category' | 'genres' | 'tags' | 'author' | 'artist'>,
  limit = 7,
  signal?: AbortSignal,
): Promise<SeriesRecommendation[]> {
  const cached = inMemoryCatalog ?? getCachedSeriesCatalog();
  if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
    const normalize = (value: string) => value.trim().toLocaleLowerCase();
    const currentGenres = new Set(currentSeries.genres.map(normalize));
    const currentTags = new Set(currentSeries.tags.map(normalize));
    const currentAuthor = normalize(currentSeries.author ?? '');
    const currentArtist = normalize(currentSeries.artist ?? '');
    const recommendations = cached.items
      .filter((item) => item.id !== currentSeries.id)
      .map((row) => {
        const sharedGenres = (row.genres ?? []).filter((genre: string) => currentGenres.has(normalize(genre))).length;
        const sharedTags = (row.tags ?? []).filter((tag: string) => currentTags.has(normalize(tag))).length;
        const sharesCreator = Boolean((currentAuthor && normalize(row.author ?? '') === currentAuthor)
          || (currentArtist && normalize(row.artist ?? '') === currentArtist));
        const sharesCategory = normalize(row.category || String(row.facts?.type ?? '')) === normalize(currentSeries.category);
        const rating = Number.parseFloat(String(getHighestSeriesRating(row.rating) ?? '0')) || 0;
        const similarityScore = sharedGenres * 4 + sharedTags * 2 + Number(sharesCategory) * 3
          + Number(sharesCreator) * 2 + rating / 10;
        const latestChapter = row.facts?.latest_chapter_number || row.facts?.last_chapter_number;
        const parsedChapter = Number.parseFloat(String(latestChapter ?? '').replace(/^ch(?:apter)?\.?\s*/i, ''));
        return { row, similarityScore, rating, chapterCount: Number.isFinite(parsedChapter) ? parsedChapter : null };
      });
    return recommendations
      .sort((left, right) => right.similarityScore - left.similarityScore
        || Number(right.row.pinned) - Number(left.row.pinned)
        || right.rating - left.rating
        || Date.parse(right.row.createdAt) - Date.parse(left.row.createdAt))
      .slice(0, limit)
      .map(({ row, chapterCount }) => ({
        title: row.title,
        href: row.href,
        cover: row.cover ?? '',
        rating: getHighestSeriesRating(row.rating),
        chapterCount,
      }));
  }

  const client = requireSupabase();
  let request = client
    .from('series')
    .select('id, title, href, cover, rating, facts, category, genres, tags, author, artist, pinned, created_at')
    .neq('id', currentSeries.id)
    .order('pinned', { ascending: false })
    .order('rating', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const currentGenres = new Set(currentSeries.genres.map(normalize));
  const currentTags = new Set(currentSeries.tags.map(normalize));
  const currentAuthor = normalize(currentSeries.author ?? '');
  const currentArtist = normalize(currentSeries.artist ?? '');
  const recommendations = (data ?? []).map((row) => {
    const sharedGenres = (row.genres ?? []).filter((genre: string) => currentGenres.has(normalize(genre))).length;
    const sharedTags = (row.tags ?? []).filter((tag: string) => currentTags.has(normalize(tag))).length;
    const sharesCreator = Boolean((currentAuthor && normalize(row.author ?? '') === currentAuthor)
      || (currentArtist && normalize(row.artist ?? '') === currentArtist));
    const sharesCategory = normalize(row.category || String(row.facts?.type ?? '')) === normalize(currentSeries.category);
    const rating = Number.parseFloat(String(getHighestSeriesRating(row.rating) ?? '0')) || 0;
    const similarityScore = sharedGenres * 4 + sharedTags * 2 + Number(sharesCategory) * 3
      + Number(sharesCreator) * 2 + rating / 10;
    const latestChapter = row.facts?.latest_chapter_number || row.facts?.last_chapter_number;
    const parsedChapter = Number.parseFloat(String(latestChapter ?? '').replace(/^ch(?:apter)?\.?\s*/i, ''));
    return { row, similarityScore, rating, chapterCount: Number.isFinite(parsedChapter) ? parsedChapter : null };
  });
  return recommendations
    .sort((left, right) => right.similarityScore - left.similarityScore
      || Number(right.row.pinned) - Number(left.row.pinned)
      || right.rating - left.rating
      || Date.parse(right.row.created_at) - Date.parse(left.row.created_at))
    .slice(0, limit)
    .map(({ row, chapterCount }) => ({
      title: row.title,
      href: row.href,
      cover: row.cover ?? '',
      rating: getHighestSeriesRating(row.rating),
      chapterCount,
    }));
}

export async function getHomeLatestReleasePage(page: number, pageSize: number, search = ''): Promise<SeriesCatalogResponse> {
  return getSeriesBrowsePage({
    page,
    pageSize,
    search,
    sort: 'latest',
    direction: 'desc',
  });
}

export async function getSeriesBySlugs(slugs: string[]): Promise<SeriesRecord[]> {
  const normalizedSlugs = [...new Set(slugs.map((slug) => slug.trim().toLocaleLowerCase()).filter(Boolean))];
  if (normalizedSlugs.length === 0) return [];
  const cached = inMemoryCatalog ?? getCachedSeriesCatalog();
  if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
    const bySlug = new Map(cached.items.map((item) => [item.slug.toLowerCase(), item]));
    if (normalizedSlugs.every((slug) => bySlug.has(slug))) {
      return normalizedSlugs.flatMap((slug) => {
        const series = bySlug.get(slug);
        return series ? [series] : [];
      });
    }
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('series')
    .select(
      'id, slug, title, href, cover, category, rating, status, pinned, chapters, ' +
      'alternate_titles, synopsis, author, artist, publishers, content_rating, year, ' +
      'original_language, demographics, genres, formats, tags, trackers, sources, ' +
      'facts, favorites, views, review_count, page_number, page_order, created_at, updated_at',
    )
    .in('slug', normalizedSlugs);
  if (error) throw error;
  const rows = (data ?? []) as unknown as SeriesDatabaseRow[];
  const bySlug = new Map(rows.map((item) => [item.slug, toSeriesRecord(item)] as const));
  return normalizedSlugs.flatMap((slug) => {
    const series = bySlug.get(slug);
    return series ? [series] : [];
  });
}

export async function getSeriesBySlug(slug: string): Promise<SeriesRecord | null> {
  const client = requireSupabase();
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;

  const { data, error } = await client
    .from('series')
    .select(
      'id, slug, title, href, cover, category, rating, status, pinned, chapters, ' +
      'alternate_titles, synopsis, author, artist, publishers, content_rating, year, ' +
      'original_language, demographics, genres, formats, tags, trackers, sources, ' +
      'facts, favorites, views, review_count, page_number, page_order, created_at, updated_at',
    )
    .eq('slug', cleanSlug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return toSeriesRecord(data);
}

export async function createSeriesRecord(input: CreateSeriesRequest): Promise<SeriesRecord> {
  const client = requireSupabase();
  const title = input.title.trim();
  const slug = slugify(title);
  if (!title || !slug) throw new Error('Enter a valid series title.');

  const { data: existing, error: existingError } = await client
    .from('series')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) throw new Error('A series with this title is already in the catalog.');

  const { data: lastPosition, error: positionError } = await client
    .from('series')
    .select('page_number, page_order')
    .order('page_number', { ascending: false })
    .order('page_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (positionError) throw positionError;

  const pageNumber = lastPosition?.page_number ?? 1;
  const pageOrder = (lastPosition?.page_order ?? 0) + 1;
  const category = input.category?.trim() || 'Manhwa';
  const status = input.status?.trim() || 'Ongoing';
  const facts = {
    type: category,
    status,
    serialization: null,
    released: input.year ? String(input.year) : null,
    lastUpdate: null,
    is_new: input.isNew !== undefined ? (input.isNew ? 'true' : 'false') : 'true',
    ...(input.facts || {}),
  };

  const { data, error } = await client
    .from('series')
    .insert({
      slug,
      title,
      href: `/series/${slug}`,
      cover: input.cover?.trim() || '',
      category,
      rating: getHighestSeriesRating(input.rating, input.sources, input.trackers),
      status,
      pinned: false,
      chapters: input.chapters ?? [],
      alternate_titles: input.alternateTitles ?? [],
      synopsis: input.synopsis?.trim() || null,
      author: input.author?.trim() || null,
      artist: input.artist?.trim() || null,
      publishers: input.publishers ?? [],
      content_rating: input.contentRating?.trim() || null,
      year: input.year ?? null,
      original_language: input.originalLanguage?.trim() || null,
      demographics: input.demographics ?? [],
      genres: input.genres ?? [],
      formats: input.formats ?? [],
      tags: input.tags ?? [],
      trackers: input.trackers ?? [],
      sources: input.sources ?? [],
      facts,
      page_number: pageNumber,
      page_order: pageOrder,
    })
    .select('*')
    .single();

  if (error) throw error;
  invalidateCatalogCache();
  return toSeriesRecord(data);
}

export type UpdateSeriesRequest = Partial<CreateSeriesRequest> & {
  id: number;
  chapters?: SeriesChapter[];
  isNew?: boolean;
};

export async function updateSeriesRecord(input: UpdateSeriesRequest): Promise<SeriesRecord> {
  const client = requireSupabase();
  const updateData: Record<string, unknown> = {};

  if (input.title !== undefined) updateData.title = input.title.trim();
  if (input.cover !== undefined) updateData.cover = input.cover.trim();
  if (input.category !== undefined) updateData.category = input.category.trim();
  if (input.status !== undefined) updateData.status = input.status.trim();
  if (input.synopsis !== undefined) updateData.synopsis = input.synopsis?.trim() || null;
  if (input.alternateTitles !== undefined) updateData.alternate_titles = input.alternateTitles;
  if (input.author !== undefined) updateData.author = input.author?.trim() || null;
  if (input.artist !== undefined) updateData.artist = input.artist?.trim() || null;
  if (input.publishers !== undefined) updateData.publishers = input.publishers;
  if (input.contentRating !== undefined) updateData.content_rating = input.contentRating?.trim() || null;
  if (input.year !== undefined) updateData.year = input.year ?? null;
  if (input.originalLanguage !== undefined) updateData.original_language = input.originalLanguage?.trim() || null;
  if (input.demographics !== undefined) updateData.demographics = input.demographics;
  if (input.genres !== undefined) updateData.genres = input.genres;
  if (input.formats !== undefined) updateData.formats = input.formats;
  if (input.tags !== undefined) updateData.tags = input.tags;
  if (input.trackers !== undefined) updateData.trackers = input.trackers;
  if (input.sources !== undefined) updateData.sources = input.sources;
  if (input.rating !== undefined || input.sources !== undefined || input.trackers !== undefined) {
    updateData.rating = getHighestSeriesRating(input.rating, input.sources, input.trackers);
  }
  if (input.chapters !== undefined) updateData.chapters = input.chapters;

  if (input.isNew !== undefined || input.facts !== undefined) {
    const { data: current } = await client
      .from('series')
      .select('facts')
      .eq('id', input.id)
      .maybeSingle();

    const existingFacts = (current?.facts as Record<string, unknown>) || {};
    updateData.facts = {
      ...existingFacts,
      ...(input.facts || {}),
      ...(input.isNew !== undefined ? { is_new: input.isNew ? 'true' : 'false' } : {}),
    };
  }

  updateData.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from('series')
    .update(updateData)
    .eq('id', input.id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Series not found or update returned no rows. Please ensure the Supabase UPDATE policy is executed.');
  invalidateCatalogCache();
  return toSeriesRecord(data);
}

export type AddSeriesChapterInput = {
  seriesId: number;
  chapterTitle: string;
  chapterHref?: string;
  status?: string;
  locked?: boolean;
};

export async function addSeriesChapter(input: AddSeriesChapterInput): Promise<SeriesRecord> {
  const client = requireSupabase();

  const { data: current, error: fetchError } = await client
    .from('series')
    .select('*')
    .eq('id', input.seriesId)
    .single();

  if (fetchError || !current) throw fetchError || new Error('Series not found');

  const existingChapters: SeriesChapter[] = Array.isArray(current.chapters) ? current.chapters : [];
  const cleanTitle = input.chapterTitle.trim();
  const slug = current.slug || slugify(current.title);

  const chapterSlug = slugify(cleanTitle);
  const href = input.chapterHref?.trim() || `/series/${slug}/${chapterSlug}`;

  const now = new Date().toISOString();
  const newChapter: SeriesChapter & { createdAt: string } = {
    title: cleanTitle,
    href,
    status: input.status?.trim() || 'New',
    locked: input.locked ?? false,
    createdAt: now,
  };

  const updatedChapters = [newChapter, ...existingChapters];
  const updatedFacts = {
    ...(current.facts || {}),
    last_chapter_added_at: now,
  };

  const { data, error } = await client
    .from('series')
    .update({
      chapters: updatedChapters,
      facts: updatedFacts,
      updated_at: now,
    })
    .eq('id', input.seriesId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Failed to add chapter.');
  invalidateCatalogCache();
  return toSeriesRecord(data);
}

export async function deleteSeriesRecord(id: number): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('series')
    .delete()
    .eq('id', id);

  if (error) throw error;
  invalidateCatalogCache();
}

export async function incrementSeriesViews(seriesId: number): Promise<number | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('increment_series_views', {
      series_id: seriesId,
    });
    if (error) {
      console.warn('Could not increment views via RPC:', error.message);
      return null;
    }
    return Number(data);
  } catch {
    return null;
  }
}


