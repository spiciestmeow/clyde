import { supabase } from './supabase';

export type HeaderVisibility = {
  home: boolean;
  series: boolean;
  shop: boolean;
  community: boolean;
  search: boolean;
  bookmarks: boolean;
  notifications: boolean;
  theme: boolean;
  account: boolean;
  discord: boolean;
};

export type HomepageVisibility = {
  featuredSeries: boolean;
  socialPromos: boolean;
  issueBanner: boolean;
  popularToday: boolean;
  continueReading: boolean;
  latestReleases: boolean;
  collections: boolean;
  communityActivity: boolean;
  mostPopular: boolean;
  footer: boolean;
};

export type SeriesPageVisibility = {
  seriesFacts: boolean;
  ratingStats: boolean;
  reportIssue: boolean;
  sources: boolean;
  synopsis: boolean;
  reviews: boolean;
  shareCard: boolean;
  discordCard: boolean;
  reactions: boolean;
  discussion: boolean;
  similarSeries: boolean;
  footer: boolean;
};

export type HeroSlide = {
  id: string;
  title: string;
  src: string;
  srcset?: string;
  href: string;
};

export const DEFAULT_HERO_SLIDES: HeroSlide[] = [];

export type SiteSettings = {
  header: HeaderVisibility;
  homepage: HomepageVisibility;
  seriesPage: SeriesPageVisibility;
  heroSlides: HeroSlide[];
};

export const DEFAULT_HEADER_VISIBILITY: HeaderVisibility = {
  home: true,
  series: true,
  shop: true,
  community: true,
  search: true,
  bookmarks: true,
  notifications: true,
  theme: true,
  account: true,
  discord: true,
};

export const DEFAULT_HOMEPAGE_VISIBILITY: HomepageVisibility = {
  featuredSeries: true,
  socialPromos: true,
  issueBanner: true,
  popularToday: true,
  continueReading: true,
  latestReleases: true,
  collections: true,
  communityActivity: true,
  mostPopular: true,
  footer: true,
};

export const DEFAULT_SERIES_PAGE_VISIBILITY: SeriesPageVisibility = {
  seriesFacts: true,
  ratingStats: true,
  reportIssue: true,
  sources: true,
  synopsis: true,
  reviews: true,
  shareCard: true,
  discordCard: true,
  reactions: true,
  discussion: true,
  similarSeries: true,
  footer: true,
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  header: DEFAULT_HEADER_VISIBILITY,
  homepage: DEFAULT_HOMEPAGE_VISIBILITY,
  seriesPage: DEFAULT_SERIES_PAGE_VISIBILITY,
  heroSlides: DEFAULT_HERO_SLIDES,
};

function parseBooleanSettings<T extends Record<string, boolean>>(
  value: unknown,
  defaults: T,
): T | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(defaults) as (keyof T)[];
  if (keys.some((key) => typeof candidate[key as string] !== 'boolean')) return null;

  return Object.fromEntries(keys.map((key) => [key, candidate[key as string]])) as T;
}

export function parseHeroSlides(value: unknown): HeroSlide[] {
  if (!Array.isArray(value)) return [...DEFAULT_HERO_SLIDES];
  const slides = value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `slide-${index + 1}`,
      title: typeof item.title === 'string' ? item.title.trim() : '',
      src: typeof item.src === 'string' ? item.src.trim() : '',
      srcset: typeof item.srcset === 'string' ? item.srcset.trim() : undefined,
      href: typeof item.href === 'string' && item.href.trim() ? item.href.trim() : '/',
    }))
    .filter((item) => Boolean(item.src));

  return slides.length > 0 ? slides : [...DEFAULT_HERO_SLIDES];
}

function parseSiteSettings(value: unknown): SiteSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const stored = value as Record<string, unknown>;
  const header = parseBooleanSettings(stored, DEFAULT_HEADER_VISIBILITY);
  if (!header) return null;

  const homepage = stored.homepage_sections === undefined
    ? { ...DEFAULT_HOMEPAGE_VISIBILITY }
    : parseBooleanSettings(stored.homepage_sections, DEFAULT_HOMEPAGE_VISIBILITY);
  if (!homepage) return null;

  const seriesPage = stored.series_page_sections === undefined
    ? { ...DEFAULT_SERIES_PAGE_VISIBILITY }
    : parseBooleanSettings(stored.series_page_sections, DEFAULT_SERIES_PAGE_VISIBILITY);
  if (!seriesPage) return null;

  const heroSlides = stored.hero_slides !== undefined
    ? parseHeroSlides(stored.hero_slides)
    : [...DEFAULT_HERO_SLIDES];

  return { header, homepage, seriesPage, heroSlides };
}

export const SITE_SETTINGS_CACHE_KEY = 'vortex-site-settings';
export const SITE_SETTINGS_UPDATED_EVENT = 'vortex-site-settings-updated';

export function getCachedSiteSettings(): SiteSettings | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawSettings = window.localStorage.getItem(SITE_SETTINGS_CACHE_KEY);
    if (!rawSettings) return null;

    const value: unknown = JSON.parse(rawSettings);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const cached = value as Record<string, unknown>;
    const header = parseBooleanSettings(cached.header, DEFAULT_HEADER_VISIBILITY);
    const homepage = parseBooleanSettings(cached.homepage, DEFAULT_HOMEPAGE_VISIBILITY);
    const seriesPage = cached.seriesPage === undefined
      ? { ...DEFAULT_SERIES_PAGE_VISIBILITY }
      : parseBooleanSettings(cached.seriesPage, DEFAULT_SERIES_PAGE_VISIBILITY);
    if (!header || !homepage || !seriesPage) return null;

    const heroSlides = cached.heroSlides ? parseHeroSlides(cached.heroSlides) : [...DEFAULT_HERO_SLIDES];

    return { header, homepage, seriesPage, heroSlides };
  } catch {
    return null;
  }
}

function cacheSiteSettings(settings: SiteSettings): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SITE_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // The remote settings remain authoritative if browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(SITE_SETTINGS_UPDATED_EVENT, { detail: settings }));
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (!supabase) {
    return getCachedSiteSettings() ?? {
      header: { ...DEFAULT_HEADER_VISIBILITY },
      homepage: { ...DEFAULT_HOMEPAGE_VISIBILITY },
      seriesPage: { ...DEFAULT_SERIES_PAGE_VISIBILITY },
      heroSlides: [...DEFAULT_HERO_SLIDES],
    };
  }
  const { data, error } = await supabase
    .from('site_settings')
    .select('header_visibility')
    .eq('id', 'global')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('The site settings row is missing. Run the Supabase setup SQL.');

  const settings = parseSiteSettings(data.header_visibility);
  if (!settings) throw new Error('The saved header settings are invalid.');
  cacheSiteSettings(settings);
  return settings;
}

export async function saveSiteSettings(settings: SiteSettings): Promise<SiteSettings> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase
    .from('site_settings')
    .update({
      header_visibility: {
        ...settings.header,
        homepage_sections: settings.homepage,
        series_page_sections: settings.seriesPage,
        hero_slides: settings.heroSlides,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'global')
    .select('header_visibility')
    .single();

  if (error) throw error;
  const savedSettings = parseSiteSettings(data.header_visibility);
  if (!savedSettings) throw new Error('Supabase returned invalid header settings.');
  cacheSiteSettings(savedSettings);
  return savedSettings;
}
