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
  facebook: boolean;
};

export type HomepageVisibility = {
  featuredSeries: boolean;
  socialPromos: boolean;
  issueBanner: boolean;
  announcement: boolean;
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

export type SeriesFilterVisibility = {
  genres: boolean;
  status: boolean;
  availability: boolean;
  type: boolean;
  chapterCount: boolean;
  releaseDate: boolean;
};

export type HeroSlide = {
  id: string;
  title: string;
  src: string;
  srcset?: string;
  href: string;
};

export type AnnouncementSettings = {
  title: string;
  content: string;
  tags: string[];
  publishedAt: string;
};

export type AccentTheme = 'halloween' | 'default';

export const DEFAULT_HERO_SLIDES: HeroSlide[] = [
  {
    id: 'hero-1',
    title: 'Absolute Domination',
    src: 'https://i0.wp.com/storage.vortexscans.org/upload/series/banner/4/d25511d1-e472-470b-9d22-a82776081885.png?w=1920&quality=85&strip=all&ssl=1',
    href: '/series/absolute-domination',
  },
  {
    id: 'hero-2',
    title: "The Hero’s Ballad",
    src: 'https://i0.wp.com/storage.vortexscans.org/upload/series/banner/4/1dded1a3-837a-4a47-ac03-d9b739005baa.png?w=1920&quality=85&strip=all&ssl=1',
    href: "/series/the-hero's-ballad",
  },
  {
    id: 'hero-3',
    title: 'Contract Killer Enrollment',
    src: 'https://i0.wp.com/storage.vortexscans.org/upload/series/banner/4/2c3128b5-e8c3-4168-a243-b7c869c22367.png?w=1920&quality=85&strip=all&ssl=1',
    href: '/series/contract-killer-enrollment',
  },
];

export type SiteSettings = {
  header: HeaderVisibility;
  homepage: HomepageVisibility;
  seriesPage: SeriesPageVisibility;
  seriesFilters: SeriesFilterVisibility;
  heroSlides: HeroSlide[];
  newSeriesOrder: string[];
  facebookUrl?: string;
  accentTheme: AccentTheme;
  announcement: AnnouncementSettings;
};

export const DEFAULT_ANNOUNCEMENT: AnnouncementSettings = {
  title: 'Welcome to Clydee Early Access',
  content: 'We’re actively building and improving the site, so you may occasionally encounter bugs, unfinished features, or unexpected behavior. Thank you for your patience as we make the reading experience better. If something isn’t working as expected, please let us know using Report Issue.',
  tags: ['Early access update'],
  publishedAt: '2026-10-27T00:00:00.000Z',
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
  facebook: true,
};

export const DEFAULT_HOMEPAGE_VISIBILITY: HomepageVisibility = {
  featuredSeries: true,
  socialPromos: true,
  issueBanner: true,
  announcement: true,
  popularToday: true,
  continueReading: true,
  latestReleases: true,
  collections: false,
  communityActivity: false,
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

export const DEFAULT_SERIES_FILTER_VISIBILITY: SeriesFilterVisibility = {
  genres: true,
  status: true,
  availability: true,
  type: true,
  chapterCount: true,
  releaseDate: true,
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  header: DEFAULT_HEADER_VISIBILITY,
  homepage: DEFAULT_HOMEPAGE_VISIBILITY,
  seriesPage: DEFAULT_SERIES_PAGE_VISIBILITY,
  seriesFilters: DEFAULT_SERIES_FILTER_VISIBILITY,
  heroSlides: DEFAULT_HERO_SLIDES,
  newSeriesOrder: [],
  facebookUrl: 'https://facebook.com',
  accentTheme: 'halloween',
  announcement: DEFAULT_ANNOUNCEMENT,
};

function parseAccentTheme(value: unknown): AccentTheme {
  return value === 'default' ? 'default' : 'halloween';
}

function applyAccentTheme(theme: AccentTheme): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.accentTheme = theme;
  }
}

function parseBooleanSettings<T extends Record<string, boolean>>(
  value: unknown,
  defaults: T,
): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaults };
  }

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(defaults) as (keyof T)[];
  const result = { ...defaults };

  for (const key of keys) {
    if (typeof candidate[key as string] === 'boolean') {
      result[key] = candidate[key as string] as T[keyof T];
    }
  }

  return result;
}

function parseHeaderVisibility(value: unknown): HeaderVisibility {
  const header = parseBooleanSettings(value, DEFAULT_HEADER_VISIBILITY);
  if (header.facebook === DEFAULT_HEADER_VISIBILITY.facebook && value && typeof value === 'object' && !Array.isArray(value)) {
    const stored = value as Record<string, unknown>;
    if (typeof stored.facebook !== 'boolean' && typeof stored.discord === 'boolean') {
      header.facebook = stored.discord;
    }
  }
  return header;
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

  return slides;
}

function parseSiteSettings(value: unknown): SiteSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const stored = value as Record<string, unknown>;
  const header = parseHeaderVisibility(stored);
  const homepage = parseBooleanSettings(stored.homepage_sections, DEFAULT_HOMEPAGE_VISIBILITY);
  const seriesPage = parseBooleanSettings(stored.series_page_sections, DEFAULT_SERIES_PAGE_VISIBILITY);
  const seriesFilters = parseBooleanSettings(stored.series_filter_sections, DEFAULT_SERIES_FILTER_VISIBILITY);
  const heroSlides = stored.hero_slides !== undefined
    ? parseHeroSlides(stored.hero_slides)
    : [...DEFAULT_HERO_SLIDES];
  const newSeriesOrder = Array.isArray(stored.new_series_order)
    ? stored.new_series_order.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [];
  const facebookUrl = typeof stored.facebook_url === 'string' && stored.facebook_url.trim()
    ? stored.facebook_url.trim()
    : typeof stored.facebookUrl === 'string' && stored.facebookUrl.trim()
    ? stored.facebookUrl.trim()
    : 'https://facebook.com';
  const storedAnnouncement = stored.announcement && typeof stored.announcement === 'object' && !Array.isArray(stored.announcement)
    ? stored.announcement as Record<string, unknown>
    : {};
  const announcement: AnnouncementSettings = {
    title: typeof storedAnnouncement.title === 'string' ? storedAnnouncement.title : DEFAULT_ANNOUNCEMENT.title,
    content: typeof storedAnnouncement.content === 'string' ? storedAnnouncement.content : DEFAULT_ANNOUNCEMENT.content,
    tags: Array.isArray(storedAnnouncement.tags)
      ? storedAnnouncement.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean).slice(0, 5)
      : [...DEFAULT_ANNOUNCEMENT.tags],
    publishedAt: typeof storedAnnouncement.publishedAt === 'string' && !Number.isNaN(Date.parse(storedAnnouncement.publishedAt))
      ? storedAnnouncement.publishedAt
      : DEFAULT_ANNOUNCEMENT.publishedAt,
  };

  return { header, homepage, seriesPage, seriesFilters, heroSlides, newSeriesOrder, facebookUrl, accentTheme: parseAccentTheme(stored.accent_theme), announcement };
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
    const header = parseHeaderVisibility(cached.header);
    const homepage = parseBooleanSettings(cached.homepage, DEFAULT_HOMEPAGE_VISIBILITY);
    const seriesPage = parseBooleanSettings(cached.seriesPage, DEFAULT_SERIES_PAGE_VISIBILITY);
    const seriesFilters = parseBooleanSettings(cached.seriesFilters, DEFAULT_SERIES_FILTER_VISIBILITY);
    const heroSlides = cached.heroSlides ? parseHeroSlides(cached.heroSlides) : [...DEFAULT_HERO_SLIDES];
    const newSeriesOrder = Array.isArray(cached.newSeriesOrder)
      ? cached.newSeriesOrder.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    const facebookUrl = typeof cached.facebookUrl === 'string' && cached.facebookUrl.trim()
      ? cached.facebookUrl.trim()
      : 'https://facebook.com';
    const cachedAnnouncement = cached.announcement && typeof cached.announcement === 'object' && !Array.isArray(cached.announcement)
      ? cached.announcement as Record<string, unknown>
      : {};
    const announcement: AnnouncementSettings = {
      title: typeof cachedAnnouncement.title === 'string' ? cachedAnnouncement.title : DEFAULT_ANNOUNCEMENT.title,
      content: typeof cachedAnnouncement.content === 'string' ? cachedAnnouncement.content : DEFAULT_ANNOUNCEMENT.content,
      tags: Array.isArray(cachedAnnouncement.tags)
        ? cachedAnnouncement.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean).slice(0, 5)
        : [...DEFAULT_ANNOUNCEMENT.tags],
      publishedAt: typeof cachedAnnouncement.publishedAt === 'string' && !Number.isNaN(Date.parse(cachedAnnouncement.publishedAt))
        ? cachedAnnouncement.publishedAt
        : DEFAULT_ANNOUNCEMENT.publishedAt,
    };

    const settings = { header, homepage, seriesPage, seriesFilters, heroSlides, newSeriesOrder, facebookUrl, accentTheme: parseAccentTheme(cached.accentTheme), announcement };
    applyAccentTheme(settings.accentTheme);
    return settings;
  } catch {
    return null;
  }
}

function cacheSiteSettings(settings: SiteSettings): void {
  if (typeof window === 'undefined') return;

  applyAccentTheme(settings.accentTheme);

  try {
    const safeSettings: SiteSettings = {
      ...settings,
      heroSlides: (settings.heroSlides || []).map((slide) => ({
        ...slide,
        src: slide.src && slide.src.startsWith('data:') && slide.src.length > 50000 ? '' : slide.src,
      })),
    };
    window.localStorage.setItem(SITE_SETTINGS_CACHE_KEY, JSON.stringify(safeSettings));
  } catch {
    // The remote settings remain authoritative if browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(SITE_SETTINGS_UPDATED_EVENT, { detail: settings }));
}

let inFlightSettingsPromise: Promise<SiteSettings> | null = null;
let lastSettingsFetchedAt = 0;
let inMemorySettings: SiteSettings | null = null;
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache to prevent redundant Supabase queries

export async function getSiteSettings(forceRefresh = false): Promise<SiteSettings> {
  const now = Date.now();
  if (!forceRefresh && inMemorySettings && (now - lastSettingsFetchedAt < SETTINGS_CACHE_TTL_MS)) {
    return inMemorySettings;
  }

  if (!forceRefresh && inFlightSettingsPromise) {
    return inFlightSettingsPromise;
  }

  inFlightSettingsPromise = (async () => {
    try {
      if (!supabase) {
        const cached = getCachedSiteSettings() ?? {
          header: { ...DEFAULT_HEADER_VISIBILITY },
          homepage: { ...DEFAULT_HOMEPAGE_VISIBILITY },
          seriesPage: { ...DEFAULT_SERIES_PAGE_VISIBILITY },
          seriesFilters: { ...DEFAULT_SERIES_FILTER_VISIBILITY },
          heroSlides: [...DEFAULT_HERO_SLIDES],
          newSeriesOrder: [],
          accentTheme: 'halloween',
          announcement: DEFAULT_ANNOUNCEMENT,
        };
        inMemorySettings = cached;
        lastSettingsFetchedAt = Date.now();
        return cached;
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
      inMemorySettings = settings;
      lastSettingsFetchedAt = Date.now();
      cacheSiteSettings(settings);
      return settings;
    } finally {
      inFlightSettingsPromise = null;
    }
  })();

  return inFlightSettingsPromise;
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
        series_filter_sections: settings.seriesFilters,
        hero_slides: settings.heroSlides,
        new_series_order: settings.newSeriesOrder,
        facebook_url: settings.facebookUrl || 'https://facebook.com',
        accent_theme: settings.accentTheme,
        announcement: settings.announcement,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'global')
    .select('header_visibility')
    .single();

  if (error) throw error;
  const savedSettings = parseSiteSettings(data.header_visibility);
  if (!savedSettings) throw new Error('Supabase returned invalid header settings.');
  inMemorySettings = savedSettings;
  lastSettingsFetchedAt = Date.now();
  cacheSiteSettings(savedSettings);
  return savedSettings;
}
