import { supabase } from './supabase';

export type SeriesChapter = {
  title: string;
  href: string;
  status: string;
  locked?: boolean;
};

export type SeriesLink = {
  name: string;
  url: string;
  logo?: string;
  isSample?: boolean;
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
  status?: string;
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
};

export type SeriesCatalogResponse = {
  totalCount: number;
  items: SeriesRecord[];
};

export type CatalogImportResult = {
  insertedCount: number;
  totalCount: number;
};

export const SERIES_CATALOG_QUERY_KEY = ['series-catalog'] as const;

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

function toSeriesRecord(value: unknown): SeriesRecord {
  const row = value as SeriesDatabaseRow;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    href: row.href,
    cover: row.cover ?? '',
    category: row.category ?? 'Manhwa',
    rating: row.rating,
    status: row.status ?? 'Ongoing',
    pinned: row.pinned ?? false,
    chapters: row.chapters ?? [],
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

export async function getSeriesCatalog(): Promise<SeriesCatalogResponse> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('series')
    .select('*')
    .order('page_number', { ascending: true })
    .order('page_order', { ascending: true })
    .order('title', { ascending: true });

  if (error) throw error;
  const items = (data ?? []).map(toSeriesRecord);
  return { totalCount: items.length, items };
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
  };

  const { data, error } = await client
    .from('series')
    .insert({
      slug,
      title,
      href: `/series/${slug}`,
      cover: input.cover?.trim() || '',
      category,
      rating: null,
      status,
      pinned: false,
      chapters: [],
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
  return toSeriesRecord(data);
}

type OriginalCatalogItem = {
  title: string;
  href: string;
  cover?: string;
  category?: string;
  rating?: string | null;
  status?: string;
  pinned?: boolean;
  chapters?: SeriesChapter[];
  pageNumber?: number;
  pageOrder?: number;
};

type OriginalSeriesDetails = {
  title?: string;
  synopsis?: string | null;
  alternateTitles?: string[];
  author?: string | null;
  artist?: string | null;
  publishers?: string[];
  contentRating?: string | null;
  year?: number | null;
  originalLanguage?: string | null;
  demographics?: string[];
  genres?: string[];
  formats?: string[];
  tags?: string[];
  trackers?: SeriesLink[];
  facts?: Record<string, string | null>;
  favorites?: string | number | null;
  reviewCount?: number | null;
  chapters?: SeriesChapter[];
};

export async function importOriginalCatalog(): Promise<CatalogImportResult> {
  const client = requireSupabase();
  const [catalogModule, detailsModule, sourcesModule] = await Promise.all([
    import('../../clone-data/series-catalog.json'),
    import('../../clone-data/series-details.json'),
    import('../../clone-data/series-sources.json'),
  ]);

  const sourceCatalog = catalogModule.default as { items: OriginalCatalogItem[] };
  const details = detailsModule.default as Record<string, OriginalSeriesDetails>;
  const sourceDirectory = sourcesModule.default as Record<string, SeriesLink[]>;
  const { data: existingRows, error: existingError } = await client.from('series').select('slug');
  if (existingError) throw existingError;
  const existingSlugs = new Set((existingRows ?? []).map((row) => row.slug as string));

  const missingRows = sourceCatalog.items
    .map((item, index) => {
      const slug = slugFromHref(item.href, item.title);
      const detail = details[slug] ?? {};
      return {
        slug,
        title: item.title,
        href: item.href,
        cover: item.cover ?? '',
        category: item.category ?? 'Manhwa',
        rating: item.rating ?? null,
        status: item.status ?? 'Ongoing',
        pinned: item.pinned ?? false,
        chapters: item.chapters ?? detail.chapters ?? [],
        alternate_titles: arrayValue(detail.alternateTitles),
        synopsis: detail.synopsis ?? null,
        author: detail.author ?? null,
        artist: detail.artist ?? null,
        publishers: arrayValue(detail.publishers),
        content_rating: detail.contentRating ?? null,
        year: detail.year ?? null,
        original_language: detail.originalLanguage ?? null,
        demographics: arrayValue(detail.demographics),
        genres: arrayValue(detail.genres),
        formats: arrayValue(detail.formats),
        tags: arrayValue(detail.tags),
        trackers: detail.trackers ?? [],
        sources: sourceDirectory[slug] ?? [],
        facts: detail.facts ?? {},
        favorites: detail.favorites == null ? null : String(detail.favorites),
        review_count: detail.reviewCount ?? null,
        page_number: item.pageNumber ?? 1,
        page_order: item.pageOrder ?? index + 1,
      };
    })
    .filter((row) => !existingSlugs.has(row.slug));

  const batchSize = 50;
  for (let index = 0; index < missingRows.length; index += batchSize) {
    const { error } = await client.from('series').insert(missingRows.slice(index, index + batchSize));
    if (error) throw error;
  }

  const { count, error: countError } = await client
    .from('series')
    .select('id', { count: 'exact', head: true });
  if (countError) throw countError;
  return {
    insertedCount: missingRows.length,
    totalCount: count ?? existingSlugs.size + missingRows.length,
  };
}
