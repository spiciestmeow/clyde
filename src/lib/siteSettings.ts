import { supabase } from './supabase';

export type HeaderVisibility = {
  home: boolean;
  series: boolean;
  shop: boolean;
  community: boolean;
  search: boolean;
  bookmarks: boolean;
  bookmarksAdminOnly: boolean;
  notifications: boolean;
  theme: boolean;
  account: boolean;
  facebook: boolean;
  donate: boolean;
  donateAdminOnly: boolean;
};

export type HomepageVisibility = {
  featuredSpotlight: boolean;
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

export type FeaturedSpotlightItem = {
  seriesId: number;
  image: string;
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

export const DEFAULT_FEATURED_SPOTLIGHT_ITEMS: FeaturedSpotlightItem[] = [];

export type DonationSupporter = {
  id: string;
  name: string;
  isAnonymous: boolean;
  actualName?: string;
  anonymousNumber?: number;
  amount: string;
  count: number;
  time: string;
  createdAt?: string;
  rank?: 1 | 2 | 3;
};

export const DEFAULT_SUPPORTERS: DonationSupporter[] = [];

/**
 * A payment / support option shown in the "Support method" grid on /donate.
 * - kind 'link'    → card opens `addressOrUrl` in a new tab.
 * - kind 'details' → card opens a popup showing the address / account with a copy button.
 */
export type SupportMethodKind = 'link' | 'details';

export type SupportMethod = {
  id: string;
  name: string;
  /** Short description shown under the name on the card. */
  detail: string;
  kind: SupportMethodKind;
  /** URL for 'link' methods, address / account number for 'details' methods. */
  addressOrUrl: string;
  /** https:// URL, /relative path or data:image/... URL. Empty → letter fallback. */
  iconUrl: string;
  /** Hex accent colour used for the card tint and popup banner. */
  color: string;
  instructions?: string;
  network?: string;
  accountName?: string;
  /** Label above the copyable value in the popup (default "Address"). */
  valueLabel?: string;
  /** Gradient end colour (hex) for the popup banner. Empty → a darker shade of `color`. */
  colorEnd?: string;
  /** Popup banner gradient direction in degrees (default 135). */
  gradientAngle?: number;
  /** Icon beside the copyable value in the popup. Empty → guessed from `valueLabel`. */
  valueIcon?: 'hash' | 'phone';
  /** Optional QR code image: https:// URL, /relative path or data:image/... URL. */
  qrUrl?: string;
  /** Caption shown above the QR code. */
  qrCaption?: string;
  enabled: boolean;
};

export const DEFAULT_SUPPORT_METHODS: SupportMethod[] = [
  {
    id: 'paypal',
    name: 'PayPal',
    detail: 'Send via PayPal (International)',
    kind: 'link',
    addressOrUrl: 'https://paypal.me/clydee',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/b/b7/PayPal_Logo_Icon_2014.svg',
    color: '#003087',
    instructions: 'Send money easily from anywhere with PayPal balance, linked bank account, or debit/credit card.',
    enabled: true,
  },
  {
    id: 'kofi',
    name: 'Ko-fi',
    detail: 'Buy us a coffee',
    kind: 'link',
    addressOrUrl: 'https://ko-fi.com/clydee',
    iconUrl: 'https://storage.ko-fi.com/cdn/cup-border.png',
    color: '#FF5E5B',
    instructions: 'Support Clydee with 0% platform fees. One-time or monthly coffees help keep servers running.',
    enabled: true,
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin (BTC)',
    detail: 'Send BTC directly',
    kind: 'details',
    addressOrUrl: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Bitcoin.svg',
    color: '#F7931A',
    colorEnd: '#E07B0A',
    network: 'Bitcoin Native (SegWit / Legacy)',
    instructions: 'Please double-check the recipient address and confirm the Bitcoin network before sending.',
    enabled: true,
  },
  {
    id: 'usdt',
    name: 'USDT (Tether)',
    detail: 'Send USDT (TRC20 ONLY)',
    kind: 'details',
    addressOrUrl: 'TYDzsYUEpvnYmQk4zGP9sWWcTEd36AmyWK',
    iconUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg',
    color: '#26A17B',
    colorEnd: '#1E8A68',
    network: 'TRON (TRC20 ONLY)',
    instructions: 'Important: Only send TRC20 USDT to this address. Sending funds via ERC20, BSC, or other networks may result in permanent loss.',
    enabled: true,
  },
  {
    id: 'gcash',
    name: 'GCash',
    detail: 'Send via GCash (Philippines)',
    kind: 'details',
    addressOrUrl: '0917-XXX-XXXX',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/52/GCash_logo.svg',
    color: '#007DFE',
    colorEnd: '#0062D6',
    valueIcon: 'phone',
    accountName: 'Clydee Admin',
    valueLabel: 'Mobile Number',
    instructions: 'Fast mobile wallet transfer in the Philippines via GCash Send Money / Express Send.',
    enabled: true,
  },
  {
    id: 'binance',
    name: 'Binance',
    detail: 'Send via Binance Pay',
    kind: 'details',
    addressOrUrl: '382910482',
    iconUrl: 'https://cryptologos.cc/logos/binance-coin-bnb-logo.svg',
    color: '#5B9BD5',
    colorEnd: '#EC6AA9',
    accountName: 'Clydee Pay',
    qrCaption: 'Scan with Binance App to pay',
    instructions: 'Instant transfer with 0 gas fees between Binance accounts using Binance Pay ID.',
    enabled: true,
  },
  {
    id: 'reward',
    name: 'Claim Your Reward',
    detail: 'Thank you for your support!',
    kind: 'link',
    addressOrUrl: 'https://discord.gg/clydee',
    iconUrl: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
    color: '#5865F2',
    instructions: 'Join our Discord server and submit your donation screenshot or txhash to claim your Supporter role & badge!',
    enabled: true,
  },
];

function isSafeIconUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/') || /^data:image\/(png|jpe?g|webp|gif|svg\+xml|avif);/i.test(value);
}

function isSafeLinkUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function parseSupportMethods(value: unknown): SupportMethod[] {
  if (!Array.isArray(value)) return DEFAULT_SUPPORT_METHODS.map((m) => ({ ...m }));
  const list: SupportMethod[] = [];
  const seen = new Set<string>();
  for (let idx = 0; idx < value.length; idx++) {
    const item = value[idx];
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const name = str(raw.name);
    if (!name) continue;
    let id = str(raw.id) || `method_${Date.now()}_${idx}`;
    if (seen.has(id)) id = `${id}_${idx}`;
    seen.add(id);
    const kind: SupportMethodKind = raw.kind === 'details' ? 'details' : 'link';
    let addressOrUrl = str(raw.addressOrUrl);
    if (kind === 'link' && addressOrUrl && !isSafeLinkUrl(addressOrUrl)) {
      // Allow bare domains like "ko-fi.com/me" but never javascript:, data:, etc.
      addressOrUrl = /^[a-z][a-z0-9+.-]*:/i.test(addressOrUrl) ? '' : `https://${addressOrUrl}`;
    }
    const iconRaw = str(raw.iconUrl);
    const colorRaw = str(raw.color);
    list.push({
      id,
      name,
      detail: str(raw.detail),
      kind,
      addressOrUrl,
      iconUrl: iconRaw && isSafeIconUrl(iconRaw) ? iconRaw : '',
      color: /^#[0-9a-f]{6}$/i.test(colorRaw) ? colorRaw : '#dc2626',
      instructions: str(raw.instructions) || undefined,
      network: str(raw.network) || undefined,
      accountName: str(raw.accountName) || undefined,
      valueLabel: str(raw.valueLabel) || undefined,
      colorEnd: /^#[0-9a-f]{6}$/i.test(str(raw.colorEnd)) ? str(raw.colorEnd) : undefined,
      gradientAngle:
        typeof raw.gradientAngle === 'number' && Number.isFinite(raw.gradientAngle)
          ? Math.min(360, Math.max(0, Math.round(raw.gradientAngle)))
          : undefined,
      valueIcon: raw.valueIcon === 'phone' ? 'phone' : raw.valueIcon === 'hash' ? 'hash' : undefined,
      qrUrl: str(raw.qrUrl) && isSafeIconUrl(str(raw.qrUrl)) ? str(raw.qrUrl) : undefined,
      qrCaption: str(raw.qrCaption) || undefined,
      enabled: raw.enabled !== false,
    });
  }
  return list;
}

function parseHexColor(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Banner gradient + readable text colour for a support method's payment popup.
 * With no `colorEnd`, the gradient ends on a slightly darker shade of `color`.
 */
export function getSupportMethodBanner(method: {
  color: string;
  colorEnd?: string;
  gradientAngle?: number;
}): { background: string; textColor: string } {
  const start: [number, number, number] = parseHexColor(method.color) ?? [220, 38, 38];
  const end: [number, number, number] =
    (method.colorEnd ? parseHexColor(method.colorEnd) : null) ??
    [Math.round(start[0] * 0.82), Math.round(start[1] * 0.82), Math.round(start[2] * 0.82)];
  const angle =
    typeof method.gradientAngle === 'number' && Number.isFinite(method.gradientAngle)
      ? method.gradientAngle
      : 135;
  const css = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2];
  const luminance = (mid[0] * 299 + mid[1] * 587 + mid[2] * 114) / 1000;
  return {
    background: `linear-gradient(${angle}deg, ${css(start)}, ${css(end)})`,
    textColor: luminance > 165 ? '#000000' : '#ffffff',
  };
}

export function parseSupporters(value: unknown): DonationSupporter[] {
  if (!Array.isArray(value)) return [];
  const list: DonationSupporter[] = [];
  for (let idx = 0; idx < value.length; idx++) {
    const item = value[idx];
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const isAnon = Boolean(raw.isAnonymous);
    let anonNum = typeof raw.anonymousNumber === 'number' ? raw.anonymousNumber : undefined;
    let rawName = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : '';
    if (isAnon && !anonNum && rawName) {
      const match = rawName.match(/Anonymous\s*#?(\d+)/i);
      if (match) anonNum = parseInt(match[1], 10);
    }
    const name = rawName || (isAnon && anonNum ? `Anonymous #${anonNum}` : isAnon ? 'Anonymous' : 'Generous Supporter');
    const amountStr = typeof raw.amount === 'string' ? raw.amount.trim() : typeof raw.amount === 'number' ? `$${raw.amount}` : '$1.00';
    const amount = amountStr.startsWith('$') ? amountStr : `$${amountStr}`;
    const count = typeof raw.count === 'number' && raw.count > 0 ? Math.round(raw.count) : 1;
    const time = typeof raw.time === 'string' && raw.time.trim() ? raw.time.trim() : 'Just now';
    const createdAt = typeof raw.createdAt === 'string' && raw.createdAt.trim() ? raw.createdAt.trim() : undefined;
    const rank = raw.rank === 1 || raw.rank === 2 || raw.rank === 3 ? (raw.rank as 1 | 2 | 3) : undefined;
    list.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : `supporter_${Date.now()}_${idx}`,
      name,
      isAnonymous: isAnon,
      actualName: typeof raw.actualName === 'string' ? raw.actualName : undefined,
      anonymousNumber: anonNum,
      amount,
      count,
      time,
      createdAt,
      rank,
    });
  }
  return list;
}

export function parseRelativeTimeToDate(value: string): Date {
  const trimmed = (value || '').trim().toLowerCase();
  const now = Date.now();

  if (!trimmed || trimmed === 'just now' || trimmed === 'now') {
    return new Date(now);
  }
  if (trimmed === 'today') {
    const d = new Date(now);
    d.setHours(d.getHours() - 2);
    return d;
  }
  if (trimmed === 'yesterday') {
    return new Date(now - 24 * 3600 * 1000);
  }

  // Check for ISO timestamp
  if (trimmed.includes('t') && !isNaN(Date.parse(value))) {
    return new Date(value);
  }

  // Regex matching e.g. "2d ago", "5mo ago", "1w ago", "3 hours ago", "10m", "1y ago"
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|wk|wks|weeks?|mo|mos|months?|y|yr|yrs|years?)\s*(?:ago)?$/i);
  if (match) {
    const amount = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    let unitMs = 60 * 1000;
    if (unit.startsWith('s')) unitMs = 1000;
    else if (unit.startsWith('m') && !unit.startsWith('mo')) unitMs = 60 * 1000;
    else if (unit.startsWith('h')) unitMs = 3600 * 1000;
    else if (unit.startsWith('d')) unitMs = 24 * 3600 * 1000;
    else if (unit.startsWith('w')) unitMs = 7 * 24 * 3600 * 1000;
    else if (unit.startsWith('mo')) unitMs = 30 * 24 * 3600 * 1000;
    else if (unit.startsWith('y')) unitMs = 365 * 24 * 3600 * 1000;

    return new Date(now - amount * unitMs);
  }

  return new Date(now);
}

export function getSupporterDisplayTime(
  supporter?: { time?: string; createdAt?: string } | null,
  currentTimestamp?: number
): string {
  if (!supporter) return '';
  const now = typeof currentTimestamp === 'number' ? currentTimestamp : Date.now();

  let createdTime: number | undefined;

  if (supporter.createdAt) {
    const parsed = new Date(supporter.createdAt).getTime();
    if (!isNaN(parsed)) createdTime = parsed;
  }

  // If no createdAt is saved, dynamically parse supporter.time into a relative timestamp so it ages
  if (!createdTime && supporter.time) {
    const parsedDate = parseRelativeTimeToDate(supporter.time);
    const parsed = parsedDate.getTime();
    if (!isNaN(parsed)) createdTime = parsed;
  }

  if (createdTime) {
    const diffMs = Math.max(0, now - createdTime);
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.max(1, Math.round(diffHours / 24));
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    return `${diffYears}y ago`;
  }

  return supporter.time || 'Just now';
}

export type SiteSettings = {
  header: HeaderVisibility;
  homepage: HomepageVisibility;
  seriesPage: SeriesPageVisibility;
  seriesFilters: SeriesFilterVisibility;
  heroSlides: HeroSlide[];
  featuredSpotlightItems: FeaturedSpotlightItem[];
  newSeriesOrder: string[];
  customSourceNames: string[];
  facebookUrl?: string;
  accentTheme: AccentTheme;
  announcement: AnnouncementSettings;
  supporters: DonationSupporter[];
  /**
   * Loaded from the dedicated `support_methods` table (see supabase/support-methods.sql), falling back to
   * a legacy `support_methods` key in site_settings, then to DEFAULT_SUPPORT_METHODS. Optional so older
   * cached/constructed settings keep working; readers fall back to DEFAULT_SUPPORT_METHODS.
   */
  supportMethods?: SupportMethod[];
};

export const DEFAULT_CUSTOM_SOURCE_NAMES = [
  'Asura Scans', 'Diva Scans', 'Dusk Scans', 'Kayn Scan', 'Lagoon Scans',
  'Madara Scans', 'Mist Scans', 'Nyx Scans', 'Qi Scans', 'Thunder Scans',
  'Vortex Scans', 'WebToon', 'StoneScape', 'Demonic Scans', 'HiveToon',
  'Drake Scans', 'ElfToon', 'GenzToon', 'Ken Scans',
];

function parseCustomSourceNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_CUSTOM_SOURCE_NAMES];
  const seen = new Set<string>();
  return value
    .filter((name): name is string => typeof name === 'string')
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLocaleLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

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
  bookmarksAdminOnly: true,
  notifications: true,
  theme: true,
  account: true,
  facebook: true,
  donate: false,
  donateAdminOnly: false,
};

export const DEFAULT_HOMEPAGE_VISIBILITY: HomepageVisibility = {
  featuredSpotlight: true,
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
  featuredSpotlightItems: DEFAULT_FEATURED_SPOTLIGHT_ITEMS,
  newSeriesOrder: [],
  customSourceNames: [...DEFAULT_CUSTOM_SOURCE_NAMES],
  facebookUrl: 'https://facebook.com',
  accentTheme: 'default',
  announcement: DEFAULT_ANNOUNCEMENT,
  supporters: [...DEFAULT_SUPPORTERS],
};

function parseAccentTheme(value: unknown): AccentTheme {
  return value === 'halloween' ? 'halloween' : 'default';
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

function parseFeaturedSpotlightItems(value: unknown): FeaturedSpotlightItem[] {
  if (!Array.isArray(value)) return [...DEFAULT_FEATURED_SPOTLIGHT_ITEMS];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      seriesId: typeof item.seriesId === 'number' && Number.isInteger(item.seriesId) ? item.seriesId : -1,
      image: typeof item.image === 'string' ? item.image.trim() : '',
    }))
    .filter((item) => item.seriesId >= 0 && item.image.length > 0)
    .slice(0, 6);
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
  const featuredSpotlightItems = parseFeaturedSpotlightItems(stored.featured_spotlight_items);
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

  const customSourceNames = parseCustomSourceNames(stored.custom_source_names);
  const supporters = parseSupporters(stored.supporters);
  const supportMethods = stored.support_methods !== undefined
    ? parseSupportMethods(stored.support_methods)
    : DEFAULT_SUPPORT_METHODS.map((m) => ({ ...m }));

  return { header, homepage, seriesPage, seriesFilters, heroSlides, featuredSpotlightItems, newSeriesOrder, customSourceNames, facebookUrl, accentTheme: parseAccentTheme(stored.accent_theme), announcement, supporters, supportMethods };
}

const SUPPORT_METHODS_TABLE = 'support_methods';

/**
 * Reads the support methods row. Returns null when the table/row doesn't exist yet (SQL not run,
 * nothing saved) or can't be read, so callers fall back to legacy data / defaults instead of failing.
 */
async function fetchStoredSupportMethods(): Promise<SupportMethod[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(SUPPORT_METHODS_TABLE)
      .select('methods')
      .eq('id', 'global')
      .maybeSingle();
    if (error || !data) return null;
    return parseSupportMethods(data.methods);
  } catch {
    return null;
  }
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
    const featuredSpotlightItems = parseFeaturedSpotlightItems(cached.featuredSpotlightItems);
    const newSeriesOrder = Array.isArray(cached.newSeriesOrder)
      ? cached.newSeriesOrder.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    const customSourceNames = parseCustomSourceNames(cached.customSourceNames);
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

    const supporters = parseSupporters(cached.supporters);
    const supportMethods = cached.supportMethods !== undefined
      ? parseSupportMethods(cached.supportMethods)
      : DEFAULT_SUPPORT_METHODS.map((m) => ({ ...m }));

    const settings = { header, homepage, seriesPage, seriesFilters, heroSlides, featuredSpotlightItems, newSeriesOrder, customSourceNames, facebookUrl, accentTheme: parseAccentTheme(cached.accentTheme), announcement, supporters, supportMethods };
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
      featuredSpotlightItems: (settings.featuredSpotlightItems || [])
        .map((item) => ({
          ...item,
          image: item.image.startsWith('data:') && item.image.length > 50000 ? '' : item.image,
        }))
        .filter((item) => item.image),
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
          featuredSpotlightItems: [...DEFAULT_FEATURED_SPOTLIGHT_ITEMS],
          newSeriesOrder: [],
          customSourceNames: [...DEFAULT_CUSTOM_SOURCE_NAMES],
          accentTheme: 'default',
          announcement: DEFAULT_ANNOUNCEMENT,
          supporters: [...DEFAULT_SUPPORTERS],
        };
        inMemorySettings = cached;
        lastSettingsFetchedAt = Date.now();
        return cached;
      }

      const storedMethodsPromise = fetchStoredSupportMethods();
      const { data, error } = await supabase
        .from('site_settings')
        .select('header_visibility')
        .eq('id', 'global')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('The site settings row is missing. Run the Supabase setup SQL.');

      const settings = parseSiteSettings(data.header_visibility);
      if (!settings) throw new Error('The saved header settings are invalid.');
      const storedMethods = await storedMethodsPromise;
      if (storedMethods) settings.supportMethods = storedMethods;
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
        featured_spotlight_items: settings.featuredSpotlightItems,
        new_series_order: settings.newSeriesOrder,
        custom_source_names: parseCustomSourceNames(settings.customSourceNames),
        facebook_url: settings.facebookUrl || 'https://facebook.com',
        accent_theme: settings.accentTheme,
        announcement: settings.announcement,
        supporters: settings.supporters,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'global')
    .select('header_visibility')
    .single();

  if (error) throw error;
  const savedSettings = parseSiteSettings(data.header_visibility);
  if (!savedSettings) throw new Error('Supabase returned invalid header settings.');
  // Support methods live in their own table, so carry them over instead of re-deriving from this row.
  if (settings.supportMethods) savedSettings.supportMethods = settings.supportMethods;
  inMemorySettings = savedSettings;
  lastSettingsFetchedAt = Date.now();
  cacheSiteSettings(savedSettings);
  return savedSettings;
}

/**
 * Saves the full support methods list to the dedicated `support_methods` table (admin only, enforced by
 * RLS) and refreshes the in-memory + localStorage settings cache so /donate updates immediately.
 */
export async function saveSupportMethods(methods: SupportMethod[]): Promise<SupportMethod[]> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase
    .from(SUPPORT_METHODS_TABLE)
    .upsert(
      { id: 'global', methods: parseSupportMethods(methods), updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
    .select('methods')
    .single();

  if (error) throw error;
  const saved = parseSupportMethods(data.methods);

  const current = inMemorySettings ?? getCachedSiteSettings();
  if (current) {
    const next: SiteSettings = { ...current, supportMethods: saved };
    inMemorySettings = next;
    lastSettingsFetchedAt = Date.now();
    cacheSiteSettings(next);
  }
  return saved;
}
