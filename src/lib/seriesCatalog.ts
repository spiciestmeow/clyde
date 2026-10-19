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

const CATALOG_CACHE_KEY = 'vortex-series-catalog-cache';

export function getCachedSeriesCatalog(): SeriesCatalogResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
      return parsed as SeriesCatalogResponse;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function cacheSeriesCatalog(data: SeriesCatalogResponse): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
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
  const result = { totalCount: items.length, items };
  cacheSeriesCatalog(result);
  return result;
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

export type UpdateSeriesRequest = Partial<CreateSeriesRequest> & {
  id: number;
  chapters?: SeriesChapter[];
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
  if (input.chapters !== undefined) updateData.chapters = input.chapters;
  updateData.updated_at = new Date().toISOString();

  const { data, error } = await client
    .from('series')
    .update(updateData)
    .eq('id', input.id)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Series not found or update returned no rows. Please ensure the Supabase UPDATE policy is executed.');
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
  return toSeriesRecord(data);
}

export async function deleteSeriesRecord(id: number): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('series')
    .delete()
    .eq('id', id);

  if (error) throw error;
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


