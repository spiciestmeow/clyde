import { supabase } from './supabase';

export const seriesReactionKeys = ['like', 'love', 'happy', 'wow', 'sad', 'angry'] as const;
export type SeriesReactionKey = (typeof seriesReactionKeys)[number];
export type SeriesReactionCounts = Record<SeriesReactionKey, number>;
export type SeriesReactionState = { counts: SeriesReactionCounts; selected: SeriesReactionKey | null };
export type SeriesSourceReactionState = { counts: Record<string, number>; selected: string[] };

const emptyCounts = (): SeriesReactionCounts => ({ like: 0, love: 0, happy: 0, wow: 0, sad: 0, angry: 0 });
const visitorStorageKey = 'vortex-anonymous-visitor-id';
let inMemoryVisitorId: string | null = null;

function createVisitorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getAnonymousVisitorId(): string {
  if (inMemoryVisitorId) return inMemoryVisitorId;
  try {
    const saved = localStorage.getItem(visitorStorageKey);
    if (saved) return (inMemoryVisitorId = saved);
    const created = createVisitorId();
    localStorage.setItem(visitorStorageKey, created);
    return (inMemoryVisitorId = created);
  } catch {
    return (inMemoryVisitorId = createVisitorId());
  }
}

function isReactionKey(value: unknown): value is SeriesReactionKey {
  return typeof value === 'string' && seriesReactionKeys.includes(value as SeriesReactionKey);
}

function parseReactionState(value: unknown): SeriesReactionState {
  const result = (value && typeof value === 'object' ? value : {}) as {
    counts?: Partial<Record<SeriesReactionKey, unknown>>;
    selected?: unknown;
  };
  const counts = emptyCounts();
  for (const key of seriesReactionKeys) {
    const count = Number(result.counts?.[key]);
    if (Number.isFinite(count) && count >= 0) counts[key] = Math.floor(count);
  }
  return { counts, selected: isReactionKey(result.selected) ? result.selected : null };
}

function parseSourceReactionState(value: unknown): SeriesSourceReactionState {
  const result = (value && typeof value === 'object' ? value : {}) as {
    counts?: Record<string, unknown>;
    selected?: unknown;
  };
  const counts: Record<string, number> = {};
  for (const [url, count] of Object.entries(result.counts || {})) {
    const parsed = Number(count);
    if (Number.isFinite(parsed) && parsed >= 0) counts[url] = Math.floor(parsed);
  }
  return {
    counts,
    selected: Array.isArray(result.selected) ? result.selected.filter((url): url is string => typeof url === 'string') : [],
  };
}

export async function loadSeriesReactionState(seriesSlug: string): Promise<SeriesReactionState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_series_reaction_state', {
    p_series_slug: seriesSlug,
    p_visitor_id: getAnonymousVisitorId(),
  });
  if (error) throw error;
  return parseReactionState(data);
}

export async function toggleSeriesReaction(
  seriesSlug: string,
  reactionKey: SeriesReactionKey,
): Promise<SeriesReactionState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('toggle_series_reaction', {
    p_series_slug: seriesSlug,
    p_visitor_id: getAnonymousVisitorId(),
    p_reaction_key: reactionKey,
  });
  if (error) throw error;
  return parseReactionState(data);
}

export async function loadSeriesSourceReactionState(seriesSlug: string): Promise<SeriesSourceReactionState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_series_source_reaction_state', {
    p_series_slug: seriesSlug,
    p_visitor_id: getAnonymousVisitorId(),
  });
  if (error) throw error;
  return parseSourceReactionState(data);
}

export async function toggleSeriesSourceReaction(
  seriesSlug: string,
  sourceUrl: string,
): Promise<SeriesSourceReactionState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('toggle_series_source_reaction', {
    p_series_slug: seriesSlug,
    p_source_url: sourceUrl,
    p_visitor_id: getAnonymousVisitorId(),
  });
  if (error) throw error;
  return parseSourceReactionState(data);
}
