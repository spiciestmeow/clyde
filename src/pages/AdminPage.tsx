import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Bookmark,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  Globe,
  Heart,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutTemplate,
  LoaderCircle,
  Lock,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Moon,
  Palette,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Rss,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Star,
  Sun,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import SeriesCatalogManager from '../components/SeriesCatalogManager';
import HeroSlidesManager from '../components/HeroSlidesManager';
import FeaturedSpotlightManager from '../components/FeaturedSpotlightManager';
import AdminGuideModal from '../components/AdminGuideModal';
import SupportMethodsManager from '../components/SupportMethodsManager';
import CloudflareTurnstile from '../components/CloudflareTurnstile';
import {
  DEFAULT_ANNOUNCEMENT,
  DEFAULT_CUSTOM_SOURCE_NAMES,
  DEFAULT_SITE_SETTINGS,
  DEFAULT_SUPPORTERS,
  getSupporterDisplayTime,
  parseRelativeTimeToDate,
  getSiteSettings,
  saveSiteSettings,
  type HeaderVisibility,
  type AnnouncementSettings,
  type AccentTheme,
  type HomepageVisibility,
  type SeriesFilterVisibility,
  type SeriesPageVisibility,
  type SiteSettings,
  type DonationSupporter,
  DEFAULT_SUPPORT_METHODS,
  saveSupportMethods as persistSupportMethods,
  type SupportMethod,
} from '../lib/siteSettings';
import { supabase, supabaseConfigReady } from '../lib/supabase';
import { getSeriesCatalog, getSeriesCatalogCount, getSeriesCatalogCoverSamples, SERIES_CATALOG_QUERY_KEY } from '../lib/seriesCatalog';
import './admin-comix.css';

function AdminBrand({ href }: { href?: string }) {
  const contents = (
    <img className="comix-logo-image" src="/clydee-logo.png" alt="Clydee" />
  );

  return href ? (
    <a href={href} className="comix-logo" title="Back to Clydee">
      {contents}
    </a>
  ) : (
    <div className="comix-logo">{contents}</div>
  );
}

function getDiceBearAvatar(name: string): string {
  const seed = encodeURIComponent((name || 'anonymous').trim().toLowerCase());
  return `https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}

type SidebarTab =
  | 'edit-profile'
  | 'followed-titles'
  | 'followed-users'
  | 'followed-groups'
  | 'read-history'
  | 'collections'
  | 'feed'
  | 'notifications'
  | 'comments'
  | 'posts'
  | 'uploads'
  | 'hero-slides'
  | 'featured-series'
  | 'import-export'
  | 'blocked-users'
  | 'donation-supporters'
  | 'settings';

interface SidebarItemDef {
  id: SidebarTab;
  label: string;
  Icon: typeof UserCheck;
  badgeType?: 'uploads' | 'supporters';
}

interface SidebarSectionDef {
  category: string;
  items: SidebarItemDef[];
}

const sidebarSections: SidebarSectionDef[] = [
  {
    category: 'Content',
    items: [
      { id: 'uploads', label: 'Uploaded Chapters', Icon: Upload, badgeType: 'uploads' },
      { id: 'hero-slides', label: 'Hero Slides', Icon: LayoutTemplate },
      { id: 'featured-series', label: 'Featured Series', Icon: ImageIcon },
      { id: 'import-export', label: 'Import / Export', Icon: Database },
    ],
  },
  {
    category: 'Monetization & Community',
    items: [
      { id: 'donation-supporters', label: 'Donation Supporters', Icon: Heart, badgeType: 'supporters' },
      { id: 'comments', label: 'Comments', Icon: MessageSquare },
      { id: 'posts', label: 'Posts', Icon: FileText },
      { id: 'blocked-users', label: 'Blocked Users', Icon: UserX },
    ],
  },
  {
    category: 'My Account',
    items: [
      { id: 'edit-profile', label: 'Edit Profile', Icon: UserCheck },
      { id: 'notifications', label: 'Notifications', Icon: Bell },
      { id: 'followed-titles', label: 'Followed Titles', Icon: Bookmark },
      { id: 'read-history', label: 'Read History', Icon: History },
      { id: 'collections', label: 'Collections', Icon: FolderKanban },
      { id: 'feed', label: 'Feed', Icon: Rss },
      { id: 'followed-users', label: 'Followed Users', Icon: Users },
      { id: 'followed-groups', label: 'Followed Groups', Icon: Users },
    ],
  },
  {
    category: 'System',
    items: [
      { id: 'settings', label: 'Settings', Icon: Settings },
    ],
  },
];

const allSidebarItems = sidebarSections.flatMap((s) => s.items);

const homepageVisibilityOptions: { key: keyof HomepageVisibility; label: string; description: string; group: string }[] = [
  { key: 'featuredSpotlight', label: 'Featured Series spotlight', description: 'Animated series spotlight at the top of the homepage.', group: 'Featured content' },
  { key: 'featuredSeries', label: 'Classic hero banner', description: 'Legacy featured-series banner carousel below the spotlight.', group: 'Featured content' },
  { key: 'socialPromos', label: 'Social promotions', description: 'Share prompt and Facebook invitation cards.', group: 'Promotions' },
  { key: 'issueBanner', label: 'Issue report banner', description: 'Help and issue-report callout below the homepage banner.', group: 'Promotions' },
  { key: 'announcement', label: 'Announcements', description: 'Show the announcement card above Recently Viewed.', group: 'Promotions' },
  { key: 'popularToday', label: 'Popular Today', description: 'Popular-series cover carousel.', group: 'Discovery' },
  { key: 'continueReading', label: 'Recently Viewed', description: 'Show series you recently opened on the homepage.', group: 'Discovery' },
  { key: 'latestReleases', label: 'Latest Releases', description: 'Recent series and chapter updates.', group: 'Discovery' },
  { key: 'mostPopular', label: 'Most Popular', description: 'Ranked popular series list.', group: 'Discovery' },
  { key: 'communityActivity', label: 'Community activity', description: 'Latest comments and top members panels.', group: 'Community' },
  { key: 'footer', label: 'Site footer', description: 'Brand information and policy links at the bottom of the page.', group: 'Site information' },
];

const headerVisibilityOptions: { key: keyof HeaderVisibility; label: string; description: string; group: string }[] = [
  { key: 'home', label: 'Home', description: 'Primary route back to the Clydee homepage.', group: 'Navigation' },
  { key: 'series', label: 'Series', description: 'Browse the full catalogue of manga and comics.', group: 'Navigation' },
  { key: 'shop', label: 'Shop', description: 'Link to the Clydee shop.', group: 'Navigation' },
  { key: 'donate', label: 'Donate / Support', description: 'Donate button in header and Support Us in footer.', group: 'Navigation' },
  { key: 'donateAdminOnly', label: 'Donate: Admin Only Mode', description: 'When enabled, the donate button and /donate page are visible and accessible only to logged-in admins. Hidden from the public.', group: 'Navigation' },
  { key: 'community', label: 'Community', description: 'Community hub and discussion entry point.', group: 'Navigation' },
  { key: 'search', label: 'Search', description: 'Quick search field in the site header.', group: 'Reader tools' },
  { key: 'bookmarks', label: 'Bookmarks', description: 'A reader’s saved series and reading list.', group: 'Reader tools' },
  { key: 'bookmarksAdminOnly', label: 'Bookmarks: Admin Only Mode', description: 'When enabled, the bookmarks button in the header is visible only to logged-in admins. Hidden from the public.', group: 'Reader tools' },
  { key: 'notifications', label: 'Notifications', description: 'Updates and activity notifications.', group: 'Reader tools' },
  { key: 'theme', label: 'Theme control', description: 'Light and dark appearance control.', group: 'Reader tools' },
  { key: 'account', label: 'Account', description: 'Sign in and account access.', group: 'Reader tools' },
  { key: 'facebook', label: 'Facebook', description: 'Facebook icon in the site header. Uses the Join Our Socials URL.', group: 'Community' },
];

const seriesPageVisibilityOptions: { key: keyof SeriesPageVisibility; label: string; description: string; group: string }[] = [
  { key: 'seriesFacts', label: 'Series facts', description: 'Status, type, creator credits, chapter count, and update date.', group: 'Series overview' },
  { key: 'ratingStats', label: 'Ratings and favorites', description: 'Rating and favorites totals beside the series cover.', group: 'Series overview' },
  { key: 'reportIssue', label: 'Issue report card', description: 'Report issue callout beside the series cover.', group: 'Series overview' },
  { key: 'sources', label: 'Sources', description: 'Reader links and available translation sources.', group: 'Information tabs' },
  { key: 'synopsis', label: 'Synopsis', description: 'Series summary and genres.', group: 'Information tabs' },
  { key: 'reviews', label: 'Reviews', description: 'Reviews tab and its content.', group: 'Information tabs' },
  { key: 'shareCard', label: 'Share card', description: 'Share this series with other readers.', group: 'Community and discovery' },
  { key: 'discordCard', label: 'Socials card', description: 'Invite readers to join our Facebook socials.', group: 'Community and discovery' },
  { key: 'reactions', label: 'Reactions', description: 'Like, Love, Laugh, Wow, Sad, and Angry reactions.', group: 'Community and discovery' },
  { key: 'discussion', label: 'Discussion', description: 'Series discussion prompt and comments area.', group: 'Community and discovery' },
  { key: 'discussionAdminOnly', label: 'Discussion: Admin Only Mode', description: 'When enabled, the discussion & comments section is visible only to logged-in admins during testing. Hidden from regular readers.', group: 'Community and discovery' },
  { key: 'similarSeries', label: 'Similar series', description: 'Recommended series list beside the page content.', group: 'Community and discovery' },
  { key: 'footer', label: 'Series page footer', description: 'Brand information and policy links below the series page.', group: 'Community and discovery' },
];

const seriesFilterVisibilityOptions: { key: keyof SeriesFilterVisibility; label: string; description: string }[] = [
  { key: 'genres', label: 'Genres', description: 'Show the genre include and exclude filters.' },
  { key: 'status', label: 'Status', description: 'Show the series status filter.' },
  { key: 'availability', label: 'Availability', description: 'Show the availability filter.' },
  { key: 'type', label: 'Type', description: 'Show the manga, manhwa, and other type filters.' },
  { key: 'chapterCount', label: 'Chapter Count', description: 'Show minimum and maximum chapter filters.' },
  { key: 'releaseDate', label: 'Release Date', description: 'Show the created after and before date filters.' },
];

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const loginCoversQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'admin-login-covers'],
    queryFn: getSeriesCatalogCoverSamples,
    enabled: !session && !checkingSession,
    staleTime: 10 * 60 * 1000,
  });
  const loginCovers = loginCoversQuery.data ?? [];

  // Theme toggle state (light / dark)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('comix-admin-theme');
      return saved === 'light' ? 'light' : 'dark';
    }
    return 'dark';
  });

  const toggleTheme = () => {
    setTheme((curr) => {
      const next = curr === 'dark' ? 'light' : 'dark';
      localStorage.setItem('comix-admin-theme', next);
      return next;
    });
  };

  useEffect(() => {
    const isLight = theme === 'light';
    document.documentElement.classList.toggle('theme-light', isLight);
    document.documentElement.classList.toggle('theme-dark', !isLight);
    return () => {
      const mainTheme = localStorage.getItem('vortex-theme-mode') === 'dark';
      document.documentElement.classList.toggle('theme-light', !mainTheme);
      document.documentElement.classList.toggle('theme-dark', mainTheme);
    };
  }, [theme]);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session ?? null);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (checkingSession) {
    return (
      <div className={`comix-admin-wrapper theme-${theme} comix-login-loading`}>
        <LoaderCircle className="spin-icon" size={32} style={{ color: 'var(--cx-teal)' }} />
      </div>
    );
  }

  if (!supabaseConfigReady) {
    return (
      <div className={`comix-admin-wrapper theme-${theme} comix-login-setup`}>
        <div className="comix-login-setup-card">
          <div className="comix-login-header">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <AdminBrand />
            </div>
            <h1>Connect Supabase</h1>
            <p>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables.</p>
          </div>
          <a href="/" className="btn-dark" style={{ width: '100%', justifyContent: 'center' }}>
            <ArrowLeft size={15} /> Back to website
          </a>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <ComixLoginScreen
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignedIn={(s) => setSession(s)}
        coverImages={loginCovers}
      />
    );
  }

  return (
    <ComixDashboard
      session={session}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={() => setSession(null)}
    />
  );
}

// ====================================================
// COMIX LOGIN SCREEN
// ====================================================
function ComixLoginScreen({
  theme,
  onToggleTheme,
  onSignedIn,
  coverImages,
}: {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onSignedIn: (session: Session) => void;
  coverImages: string[];
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setLockoutSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [lockoutSeconds]);

  const lockoutTime = `${String(Math.floor(lockoutSeconds / 60)).padStart(2, '0')}:${String(lockoutSeconds % 60).padStart(2, '0')}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setFormError('');
    try {
      // Vite's local dev server does not serve Vercel API routes. Keep local
      // admin sign-in working through Supabase Auth; deployed sign-in uses the
      // server endpoint so failed attempts are rate-limited.
      if (import.meta.env.DEV) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error || !data.session) {
          setFormError('Sign in failed. Check your admin email and password.');
          return;
        }
        onSignedIn(data.session);
        return;
      }

      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = await response.json().catch(() => ({}));
      if (typeof result.retryAfterSeconds === 'number' && result.retryAfterSeconds > 0) {
        setLockoutSeconds(Math.ceil(result.retryAfterSeconds));
      }
      if (!response.ok || !result.session?.access_token || !result.session?.refresh_token) {
        setFormError(result.retryAfterSeconds ? '' : result.error || 'Sign in failed. Check your admin email and password.');
        return;
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      });
      if (error || !data.session) {
        setFormError('Sign in failed. Please try again.');
        return;
      }
      setLockoutSeconds(0);
      onSignedIn(data.session);
    } catch {
      setFormError('Could not reach the sign-in service. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="comix-admin-wrapper theme-dark comix-login-screen">
      <a href="/" className="comix-login-back"><ArrowLeft size={15} /> Go back</a>
      <section className="comix-login-content">
        <div className="comix-login-brand-mark"><AdminBrand /></div>
        <div className="comix-login-header">
          <h1><span>CLYDEE</span><br />WELCOME BACK</h1>
          <div className="comix-login-divider"><i /></div>
          <p>Sign in to manage titles, chapters, and site settings.</p>
        </div>

        <div className="comix-login-card">
          <div className="comix-login-card-top">
            <span>ADMIN ACCESS</span>
          </div>
          {formError && <div className="comix-login-error" role="alert">{formError}</div>}
          {lockoutSeconds > 0 && (
            <div className="comix-login-error" role="status" aria-live="polite">
              Too many incorrect attempts. Try again in <strong>{lockoutTime}</strong>.
            </div>
          )}

          <form onSubmit={submit}>
            <div className="comix-login-field">
              <label htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                className="comix-login-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="comix-login-field">
              <label htmlFor="login-password">Password</label>
              <div className="comix-login-password-wrap">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="comix-login-input"
                  style={{ paddingRight: 48 }}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="comix-login-password-toggle"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ margin: '14px 0 6px', display: 'flex', justifyContent: 'center' }}>
              <CloudflareTurnstile
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                theme="dark"
              />
            </div>

            <button type="submit" className="btn-teal comix-login-btn" disabled={busy || lockoutSeconds > 0 || !email || !password || !turnstileToken}>
              {busy ? <LoaderCircle className="spin-icon" size={16} /> : <ShieldCheck size={16} />}
              {busy ? 'Signing in...' : lockoutSeconds > 0 ? `Locked · ${lockoutTime}` : 'Log in'}
            </button>
          </form>
        </div>
      </section>
      <aside className="comix-login-art" aria-hidden="true">
        <div className="comix-login-collage">
          {coverImages.map((cover, index) => (
            <img key={`${cover}-${index}`} src={cover} alt="" loading="lazy" />
          ))}
        </div>
        <div className="comix-login-art-overlay" />
      </aside>
    </div>
  );
}

// ====================================================
// COMIX DASHBOARD (MATCHING IMAGE b295b4a2.png)
// ====================================================
const VALID_TABS = new Set<SidebarTab>([
  'edit-profile',
  'followed-titles',
  'followed-users',
  'followed-groups',
  'read-history',
  'collections',
  'feed',
  'notifications',
  'comments',
  'posts',
  'uploads',
  'hero-slides',
  'featured-series',
  'import-export',
  'blocked-users',
  'donation-supporters',
  'settings',
]);

type SettingsSubTab =
  | 'homepage'
  | 'announcement'
  | 'header'
  | 'series'
  | 'filters'
  | 'socials'
  | 'sources'
  | 'theme'
  | 'supporters';

const VALID_SETTINGS_SUBTABS = new Set<SettingsSubTab>([
  'homepage',
  'announcement',
  'header',
  'series',
  'filters',
  'socials',
  'sources',
  'theme',
]);

function getInitialActiveTab(): SidebarTab {
  if (typeof window === 'undefined') return 'uploads';
  try {
    const params = new URLSearchParams(window.location.search);
    const paramTab = params.get('tab') as SidebarTab;
    if (paramTab && VALID_TABS.has(paramTab)) return paramTab;
  } catch {}
  try {
    const hash = window.location.hash.replace(/^#/, '') as SidebarTab;
    if (VALID_TABS.has(hash)) return hash;
  } catch {}
  try {
    const stored = localStorage.getItem('comix_admin_active_tab') as SidebarTab;
    if (stored && VALID_TABS.has(stored)) return stored;
  } catch {}
  return 'uploads';
}

function getInitialSettingsSubTab(): SettingsSubTab {
  if (typeof window === 'undefined') return 'homepage';
  try {
    const params = new URLSearchParams(window.location.search);
    const sub = params.get('subtab') as SettingsSubTab;
    if (sub && VALID_SETTINGS_SUBTABS.has(sub)) return sub;
  } catch {}
  try {
    const stored = localStorage.getItem('comix_admin_settings_subtab') as SettingsSubTab;
    if (stored && VALID_SETTINGS_SUBTABS.has(stored)) return stored;
  } catch {}
  return 'homepage';
}

function ComixDashboard({
  session,
  theme,
  onToggleTheme,
  onLogout,
}: {
  session: Session;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SidebarTab>(getInitialActiveTab);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>(getInitialSettingsSubTab);
  const [topSearch, setTopSearch] = useState('');

  const isFirstSyncRef = useRef(true);

  // Sync activeTab & settingsSubTab with URL and localStorage
  useEffect(() => {
    try {
      localStorage.setItem('comix_admin_active_tab', activeTab);
      localStorage.setItem('comix_admin_settings_subtab', settingsSubTab);

      const url = new URL(window.location.href);
      const currentParamTab = url.searchParams.get('tab');
      const currentParamSub = url.searchParams.get('subtab');

      const tabNeedsUpdate = currentParamTab !== activeTab;
      const subNeedsUpdate =
        activeTab === 'settings'
          ? currentParamSub !== settingsSubTab
          : currentParamSub !== null;

      if (tabNeedsUpdate || subNeedsUpdate) {
        url.searchParams.set('tab', activeTab);
        if (activeTab === 'settings') {
          url.searchParams.set('subtab', settingsSubTab);
        } else {
          url.searchParams.delete('subtab');
        }

        if (isFirstSyncRef.current) {
          window.history.replaceState(null, '', url.toString());
        } else {
          window.history.pushState(null, '', url.toString());
        }
      }
    } catch {
      // ignore
    } finally {
      isFirstSyncRef.current = false;
    }
  }, [activeTab, settingsSubTab]);

  useEffect(() => {
    const onPopState = () => {
      setActiveTab(getInitialActiveTab());
      setSettingsSubTab(getInitialSettingsSubTab());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Series catalog stats
  const catalogCountQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'admin-count'],
    queryFn: getSeriesCatalogCount,
    staleTime: 10 * 60 * 1000,
  });
  const catalogQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'admin-full'],
    queryFn: getSeriesCatalog,
    enabled: activeTab === 'import-export',
    staleTime: 10 * 60 * 1000,
  });
  const catalogItems = catalogQuery.data?.items ?? [];
  const totalTitleCount = catalogCountQuery.data ?? 0;
  const totalChapters = useMemo(() => catalogItems.reduce((acc, s) => acc + (s.chapters?.length || 0), 0), [catalogItems]);
  const totalGroups = useMemo(() => {
    const names = new Set<string>();
    catalogItems.forEach((series) => {
      (series.sources || []).forEach((source) => {
        const name = source.name?.trim().toLocaleLowerCase();
        if (name) names.add(name);
      });
    });
    return names.size;
  }, [catalogItems]);

  // Site settings state
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementSettings>(DEFAULT_ANNOUNCEMENT);
  const [announcementTagsInput, setAnnouncementTagsInput] = useState(DEFAULT_ANNOUNCEMENT.tags.join(', '));
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveMessage, setSaveMessage] = useState('Saved');
  const [facebookUrlInput, setFacebookUrlInput] = useState('https://facebook.com');
  const [customSourceNamesDraft, setCustomSourceNamesDraft] = useState<string[]>(DEFAULT_CUSTOM_SOURCE_NAMES);
  const [customSourceNamesSearch, setCustomSourceNamesSearch] = useState('');
  const [customSourceNameInput, setCustomSourceNameInput] = useState('');

  // Donation supporters state
  const [supportersDraft, setSupportersDraft] = useState<DonationSupporter[]>(DEFAULT_SUPPORTERS);
  const [supporterSearch, setSupporterSearch] = useState('');
  const [supporterFilter, setSupporterFilter] = useState<'all' | 'anonymous' | 'named' | 'podium'>('all');
  const [editingSupporterId, setEditingSupporterId] = useState<string | null>(null);
  const [showSupporterModal, setShowSupporterModal] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [supporterToDelete, setSupporterToDelete] = useState<DonationSupporter | null>(null);
  const [amountError, setAmountError] = useState('');
  const [nameError, setNameError] = useState('');
  const [donationTab, setDonationTab] = useState<'supporters' | 'methods'>('supporters');
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Dynamic live clock ticker so all relative timers advance and move in real time
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Auto-computed top 3 podium based on highest donation amount
  const podiumRankMap = useMemo(() => {
    const sorted = [...supportersDraft].sort((a, b) => {
      const valA = parseFloat(a.amount.replace(/[^0-9.]/g, '')) || 0;
      const valB = parseFloat(b.amount.replace(/[^0-9.]/g, '')) || 0;
      return valB - valA;
    });
    const map = new Map<string, 1 | 2 | 3>();
    if (sorted[0]) map.set(sorted[0].id, 1);
    if (sorted[1]) map.set(sorted[1].id, 2);
    if (sorted[2]) map.set(sorted[2].id, 3);
    return map;
  }, [supportersDraft]);

  const [supporterForm, setSupporterForm] = useState<{
    isAnonymous: boolean;
    anonymousNumber: number;
    actualName: string;
    amount: string;
    count: number;
    timeMode: 'auto' | 'custom' | 'manual';
    customAmount: number;
    customUnit: 'minutes' | 'hours' | 'days' | 'months' | 'years';
    manualTime: string;
    createdAt?: string;
  }>({
    isAnonymous: true,
    anonymousNumber: 1,
    actualName: '',
    amount: '', // Empty value at first as required
    count: 1,
    timeMode: 'auto',
    customAmount: 5,
    customUnit: 'minutes',
    manualTime: 'Just now',
    createdAt: undefined,
  });

  const livePreviewTime = useMemo(() => {
    if (supporterForm.timeMode === 'auto') {
      return 'Just now (Auto Timer)';
    }
    if (supporterForm.timeMode === 'custom') {
      const amt = Math.max(1, Number(supporterForm.customAmount) || 1);
      const unit = supporterForm.customUnit;
      const unitShort = unit === 'minutes' ? 'm' : unit === 'hours' ? 'h' : unit === 'days' ? 'd' : unit === 'months' ? 'mo' : 'y';
      return `${amt}${unitShort} ago (Auto Timer)`;
    }
    const parsedDate = parseRelativeTimeToDate(supporterForm.manualTime);
    return `${getSupporterDisplayTime({ createdAt: parsedDate.toISOString() }, nowTick)} (Auto Timer)`;
  }, [supporterForm.timeMode, supporterForm.customAmount, supporterForm.customUnit, supporterForm.manualTime, nowTick]);
  const groupedCustomSourceNames = useMemo(() => {
    const groups = new Map<string, string[]>();
    [...customSourceNamesDraft]
      .map((name) => name.trim())
      .filter((name) => name && name.toLocaleLowerCase().includes(customSourceNamesSearch.trim().toLocaleLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .forEach((name) => {
        const firstCharacter = name.charAt(0).toLocaleUpperCase();
        const letter = /^[A-Z]$/.test(firstCharacter) ? firstCharacter : '#';
        groups.set(letter, [...(groups.get(letter) || []), name]);
      });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [customSourceNamesDraft, customSourceNamesSearch]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileMenuOpen]);


  useEffect(() => {
    let active = true;
    void getSiteSettings().then((s) => {
      if (active) {
        setSettings(s);
        setAnnouncementDraft(s.announcement);
        setAnnouncementTagsInput(s.announcement.tags.join(', '));
        setCustomSourceNamesDraft(s.customSourceNames);
        if (s?.facebookUrl) setFacebookUrlInput(s.facebookUrl);
        if (s?.supporters) setSupportersDraft(s.supporters);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const saveFacebookUrl = async () => {
    if (!settings || savingSettings) return;
    const cleanUrl = facebookUrlInput.trim() || 'https://facebook.com';
    const nextSettings: SiteSettings = {
      ...settings,
      facebookUrl: cleanUrl,
    };
    setSettings(nextSettings);
    setSavingSettings(true);
    setSaveMessage('Saving...');
    try {
      const saved = await saveSiteSettings(nextSettings);
      setSettings(saved);
      if (saved?.facebookUrl) setFacebookUrlInput(saved.facebookUrl);
      setSaveMessage('Saved');
    } catch {
      setSaveMessage('Error saving');
    } finally {
      setSavingSettings(false);
    }
  };

  const saveCustomSourceNames = async () => {
    if (!settings || savingSettings) return;
    const pendingName = customSourceNameInput.trim();
    const sourceNames = pendingName ? [...customSourceNamesDraft, pendingName] : customSourceNamesDraft;
    const seen = new Set<string>();
    const customSourceNames = sourceNames
      .map((name) => name.trim())
      .filter((name) => {
        const key = name.toLocaleLowerCase();
        if (!name || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const previousSettings = settings;
    const nextSettings: SiteSettings = { ...settings, customSourceNames };
    setCustomSourceNamesDraft(customSourceNames);
    setCustomSourceNameInput('');
    setSettings(nextSettings);
    setSavingSettings(true);
    setSaveMessage('Saving...');
    try {
      const saved = await saveSiteSettings(nextSettings);
      setSettings(saved);
      setCustomSourceNamesDraft(saved.customSourceNames);
      setSaveMessage('Saved');
    } catch {
      setSettings(previousSettings);
      setCustomSourceNamesDraft(previousSettings.customSourceNames);
      setCustomSourceNameInput(pendingName);
      setSaveMessage('Error saving');
    } finally {
      setSavingSettings(false);
    }
  };

  const saveAccentTheme = async (accentTheme: AccentTheme) => {
    if (!settings || savingSettings || settings.accentTheme === accentTheme) return;
    const previousSettings = settings;
    const nextSettings: SiteSettings = { ...settings, accentTheme };
    document.documentElement.dataset.accentTheme = accentTheme;
    setSettings(nextSettings);
    setSavingSettings(true);
    setSaveMessage('Saving...');
    try {
      const saved = await saveSiteSettings(nextSettings);
      setSettings(saved);
      setSaveMessage('Saved');
    } catch {
      document.documentElement.dataset.accentTheme = previousSettings.accentTheme;
      setSettings(previousSettings);
      setSaveMessage('Error saving');
    } finally {
      setSavingSettings(false);
    }
  };

  const saveAnnouncement = async () => {
    if (!settings || savingSettings) return;
    const previousSettings = settings;
    const announcement: AnnouncementSettings = {
      ...announcementDraft,
      title: announcementDraft.title.trim(),
      content: announcementDraft.content.trim(),
      tags: announcementTagsInput.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 5),
      publishedAt: new Date().toISOString(),
    };
    const nextSettings: SiteSettings = { ...settings, announcement };
    setSettings(nextSettings);
    setSavingSettings(true);
    setSaveMessage('Saving...');
    try {
      const saved = await saveSiteSettings(nextSettings);
      setSettings(saved);
      setAnnouncementDraft(saved.announcement);
      setAnnouncementTagsInput(saved.announcement.tags.join(', '));
      setSaveMessage('Saved');
    } catch {
      setSettings(previousSettings);
      setSaveMessage('Error saving');
    } finally {
      setSavingSettings(false);
    }
  };

  const getNextAnonymousNumber = (list: DonationSupporter[] = supportersDraft) => {
    let max = 0;
    for (const s of list) {
      if (typeof s.anonymousNumber === 'number' && s.anonymousNumber > max) {
        max = s.anonymousNumber;
      } else {
        const match = s.name.match(/Anonymous\s*#?(\d+)/i);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > max) max = num;
        }
      }
    }
    return max + 1;
  };

  const saveSupportMethods = async (newList: SupportMethod[]) => {
    if (!settings || savingSettings) return;
    setSavingSettings(true);
    setSaveMessage('Saving support methods...');
    try {
      const savedMethods = await persistSupportMethods(newList);
      setSettings({ ...settings, supportMethods: savedMethods });
      setSaveMessage('Support methods saved');
    } catch (err) {
      console.error('Failed to save support methods:', err);
      alert(
        'Failed to save support methods. If you have not yet, run supabase/support-methods.sql in the Supabase SQL editor (and make sure you are signed in as the admin).',
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const saveSupporters = async (newList: DonationSupporter[]) => {
    if (!settings || savingSettings) return;
    setSavingSettings(true);
    setSaveMessage('Saving supporters...');
    try {
      const nextSettings: SiteSettings = { ...settings, supporters: newList };
      const saved = await saveSiteSettings(nextSettings);
      setSettings(saved);
      setSupportersDraft(saved.supporters);
      setSaveMessage('Supporters saved');
    } catch (err) {
      console.error('Failed to save supporters:', err);
      alert('Failed to save supporters to database.');
    } finally {
      setSavingSettings(false);
    }
  };

  const calculateFinalTimeAndCreatedAt = () => {
    if (supporterForm.timeMode === 'auto') {
      const nowIso = new Date().toISOString();
      return {
        time: 'Just now',
        createdAt: nowIso,
      };
    }
    if (supporterForm.timeMode === 'custom') {
      const amt = Math.max(1, Number(supporterForm.customAmount) || 1);
      const unit = supporterForm.customUnit;
      const unitMs =
        unit === 'minutes' ? 60 * 1000 :
        unit === 'hours' ? 60 * 60 * 1000 :
        unit === 'days' ? 24 * 60 * 60 * 1000 :
        unit === 'months' ? 30 * 24 * 60 * 60 * 1000 :
        365 * 24 * 60 * 60 * 1000;
      const pastTime = new Date(Date.now() - amt * unitMs);
      const pastIso = pastTime.toISOString();
      return {
        time: getSupporterDisplayTime({ createdAt: pastIso }),
        createdAt: pastIso,
      };
    }
    // Preset timer mode: dynamically anchor to relative timestamp so it ages
    const parsedDate = parseRelativeTimeToDate(supporterForm.manualTime);
    const parsedIso = parsedDate.toISOString();
    return {
      time: getSupporterDisplayTime({ createdAt: parsedIso }),
      createdAt: parsedIso,
    };
  };

  const openNewSupporterModal = () => {
    const nextNum = getNextAnonymousNumber();
    setAmountError('');
    setNameError('');
    setSupporterForm({
      isAnonymous: true,
      anonymousNumber: nextNum,
      actualName: '',
      amount: '', // Starts as empty value and is required
      count: 1,
      timeMode: 'auto',
      customAmount: 5,
      customUnit: 'minutes',
      manualTime: 'Just now',
      createdAt: undefined,
    });
    setEditingSupporterId('new');
    setShowSaveConfirm(false);
    setShowSupporterModal(true);
  };

  const openEditSupporterModal = (s: DonationSupporter) => {
    setAmountError('');
    setNameError('');
    let timeMode: 'auto' | 'custom' | 'manual' = 'manual';
    let customAmount = 5;
    let customUnit: 'minutes' | 'hours' | 'days' | 'months' | 'years' = 'minutes';
    let manualTime = s.time || 'Just now';

    if (s.createdAt) {
      const createdMs = new Date(s.createdAt).getTime();
      const diffMs = Math.max(0, Date.now() - createdMs);
      if (diffMs < 2 * 60 * 1000) {
        timeMode = 'auto';
      } else {
        timeMode = 'custom';
        const mins = Math.round(diffMs / (60 * 1000));
        const hours = Math.round(diffMs / (60 * 60 * 1000));
        const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
        const months = Math.round(diffMs / (30 * 24 * 60 * 60 * 1000));
        const years = Math.round(diffMs / (365 * 24 * 60 * 60 * 1000));
        if (years >= 1) {
          customAmount = years;
          customUnit = 'years';
        } else if (months >= 1) {
          customAmount = months;
          customUnit = 'months';
        } else if (days >= 1) {
          customAmount = days;
          customUnit = 'days';
        } else if (hours >= 1) {
          customAmount = hours;
          customUnit = 'hours';
        } else {
          customAmount = Math.max(1, mins);
          customUnit = 'minutes';
        }
      }
    } else if (s.time) {
      const match = s.time.match(/^(\d+)\s*(m|min|mins|h|hr|hrs|d|days?|mo|mos|months?|y|yr|years?)\s*(?:ago)?$/i);
      if (match) {
        timeMode = 'custom';
        customAmount = parseInt(match[1], 10) || 1;
        const u = match[2].toLowerCase();
        if (u.startsWith('y')) customUnit = 'years';
        else if (u.startsWith('mo')) customUnit = 'months';
        else if (u.startsWith('d')) customUnit = 'days';
        else if (u.startsWith('h')) customUnit = 'hours';
        else customUnit = 'minutes';
      } else if (s.time.toLowerCase() === 'just now') {
        timeMode = 'auto';
      }
    }

    setSupporterForm({
      isAnonymous: s.isAnonymous,
      anonymousNumber: s.anonymousNumber || (s.name.match(/Anonymous\s*#?(\d+)/i)?.[1] ? parseInt(RegExp.$1, 10) : 1),
      actualName: s.actualName || (s.isAnonymous ? '' : s.name),
      amount: s.amount.replace(/^\$/, ''),
      count: s.count || 1,
      timeMode,
      customAmount,
      customUnit,
      manualTime,
      createdAt: s.createdAt,
    });
    setEditingSupporterId(s.id);
    setShowSaveConfirm(false);
    setShowSupporterModal(true);
  };

  const handleSaveSupporterForm = () => {
    // Validate required actual supporter name if mode is not anonymous
    if (!supporterForm.isAnonymous && !supporterForm.actualName.trim()) {
      setNameError('Actual supporter name is required.');
      return;
    }
    setNameError('');

    // Validate required donation amount
    const rawAmt = supporterForm.amount.replace(/[^0-9.]/g, '').trim();
    const numAmt = parseFloat(rawAmt);
    if (!rawAmt || isNaN(numAmt) || numAmt <= 0) {
      setAmountError('Donation amount is required and must be greater than $0.00.');
      return;
    }
    setAmountError('');
    setShowSaveConfirm(true);
  };

  const handleExecuteSave = () => {
    const isAnon = supporterForm.isAnonymous;
    const name = isAnon
      ? `Anonymous #${supporterForm.anonymousNumber}`
      : supporterForm.actualName.trim() || 'Generous Supporter';

    let amtStr = supporterForm.amount.trim();
    if (!amtStr) amtStr = '5.00';
    if (!amtStr.startsWith('$')) amtStr = `$${amtStr}`;

    const { time, createdAt } = calculateFinalTimeAndCreatedAt();

    const newOrUpdated: DonationSupporter = {
      id: editingSupporterId === 'new' ? `supporter_${Date.now()}` : editingSupporterId!,
      name,
      isAnonymous: isAnon,
      anonymousNumber: isAnon ? supporterForm.anonymousNumber : undefined,
      actualName: !isAnon ? supporterForm.actualName.trim() : undefined,
      amount: amtStr,
      count: Math.max(1, Number(supporterForm.count) || 1),
      time,
      createdAt,
    };

    let updatedList: DonationSupporter[];
    if (editingSupporterId === 'new') {
      updatedList = [newOrUpdated, ...supportersDraft];
    } else {
      updatedList = supportersDraft.map((item) => (item.id === editingSupporterId ? newOrUpdated : item));
    }

    setSupportersDraft(updatedList);
    void saveSupporters(updatedList);
    setShowSaveConfirm(false);
    setShowSupporterModal(false);
    setEditingSupporterId(null);
  };

  const handleConfirmDelete = () => {
    if (!supporterToDelete) return;
    const updatedList = supportersDraft.filter((s) => s.id !== supporterToDelete.id);
    setSupportersDraft(updatedList);
    void saveSupporters(updatedList);
    setSupporterToDelete(null);
  };

  const handleExportSupporters = () => {
    try {
      const json = JSON.stringify(supportersDraft, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url;
      a.download = `supporters-backup-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export supporters.');
    }
  };

  const handleToggle = async (
    category: 'homepage' | 'header' | 'seriesPage' | 'seriesFilters',
    key: string,
  ) => {
    if (!settings || savingSettings) return;
    const currentCategory = { ...settings[category] } as Record<string, boolean>;
    const nextCategory = {
      ...currentCategory,
      [key]: !currentCategory[key],
    };
    const nextSettings: SiteSettings = {
      ...settings,
      [category]: nextCategory,
    };

    setSettings(nextSettings);
    setSavingSettings(true);
    setSaveMessage('Saving...');

    try {
      const saved = await saveSiteSettings(nextSettings);
      setSettings(saved);
      setSaveMessage('Saved');
    } catch {
      setSaveMessage('Error saving');
    } finally {
      setSavingSettings(false);
    }
  };

  const saveNewSeriesOrder = async (nextOrder: string[]) => {
    if (!settings || savingSettings) return;
    const previousSettings = settings;
    const nextSettings: SiteSettings = { ...settings, newSeriesOrder: nextOrder };
    setSettings(nextSettings);
    setSavingSettings(true);
    setSaveMessage('Saving...');
    try {
      const saved = await saveSiteSettings(nextSettings);
      setSettings(saved);
      setSaveMessage('Saved');
    } catch {
      setSettings(previousSettings);
      setSaveMessage('Error saving');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    if (supabase) {
      await supabase.auth.signOut();
    }
    onLogout();
  };

  // Profile Form state initialized from session metadata or localStorage
  const savedProfile = useMemo(() => {
    try {
      const raw = localStorage.getItem('vortex_admin_profile');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const meta = session.user.user_metadata || {};
  const [profileDisplayName, setProfileDisplayName] = useState<string>(
    () => meta.full_name || meta.display_name || savedProfile?.displayName || 'Clyde Bustamante'
  );
  const [profileUsername, setProfileUsername] = useState<string>(
    () => meta.username || savedProfile?.username || (session.user.email?.split('@')[0] || 'clydhex')
  );
  const [profileBio, setProfileBio] = useState<string>(
    () => meta.bio || savedProfile?.bio || ''
  );
  const [profileSocials, setProfileSocials] = useState<string>(
    () => meta.social_links || savedProfile?.socials || ''
  );
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string>(
    () => meta.avatar_url || savedProfile?.avatarUrl || ''
  );
  const [profileEmail] = useState<string>(
    () => session.user.email || 'clydhex@gmail.com'
  );
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // User display name & initial dynamically reflected
  const userInitial = (profileDisplayName?.[0] || session.user.email?.[0] || 'C').toUpperCase();
  const displayName = profileDisplayName || session.user.user_metadata?.full_name || 'Clyde Bustamante';
  const publicProfileId = session.user.id || '';

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileFeedback(null);

    if (newPassword || confirmPassword) {
      if (newPassword.length < 6) {
        setProfileFeedback({ type: 'error', message: 'Password must be at least 6 characters long.' });
        setSavingProfile(false);
        return;
      }
      if (newPassword !== confirmPassword) {
        setProfileFeedback({ type: 'error', message: 'New password and confirm password do not match.' });
        setSavingProfile(false);
        return;
      }
    }

    try {
      const profileData = {
        full_name: profileDisplayName.trim(),
        display_name: profileDisplayName.trim(),
        username: profileUsername.trim().replace(/^@/, ''),
        bio: profileBio.trim(),
        social_links: profileSocials.trim(),
        avatar_url: profileAvatarUrl.trim(),
      };

      try {
        localStorage.setItem(
          'vortex_admin_profile',
          JSON.stringify({
            displayName: profileData.display_name,
            username: profileData.username,
            bio: profileData.bio,
            socials: profileData.social_links,
            avatarUrl: profileData.avatar_url,
          })
        );
      } catch {}

      if (supabase) {
        const updatePayload: { data: Record<string, unknown>; password?: string } = {
          data: profileData,
        };
        if (newPassword) {
          updatePayload.password = newPassword;
        }
        const { error } = await supabase.auth.updateUser(updatePayload);
        if (error) {
          console.warn('Supabase updateUser warning:', error.message);
          if (newPassword) {
            setProfileFeedback({ type: 'error', message: `Profile updated, but password change failed: ${error.message}` });
            setSavingProfile(false);
            return;
          }
        }
      }

      setNewPassword('');
      setConfirmPassword('');
      setProfileFeedback({ type: 'success', message: 'Changes saved successfully.' });
      setTimeout(() => setProfileFeedback(null), 4000);
    } catch (err: unknown) {
      setProfileFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save changes.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCopyProfileId = () => {
    try {
      navigator.clipboard.writeText(publicProfileId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleAvatarFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setProfileFeedback({ type: 'error', message: 'Avatar image must be under 1 MB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        setProfileAvatarUrl(result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={`comix-admin-wrapper theme-${theme}`}>
      {/* Top Navbar */}
      <header className="comix-topbar">
        <div className="comix-topbar-left">
          <AdminBrand href="/" />

          <div className="comix-search-wrap">
            <Search className="comix-search-icon" size={15} />
            <input
              type="text"
              className="comix-search-input"
              placeholder="Search any title..."
              value={topSearch}
              onChange={(e) => {
                setTopSearch(e.target.value);
                if (e.target.value.trim()) setActiveTab('uploads');
              }}
            />
            <a href="/series" className="comix-browse-pill">
              Browse
            </a>
          </div>
        </div>

        <div className="comix-topbar-right">
          <button
            type="button"
            className="comix-icon-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button type="button" className="comix-icon-btn" onClick={() => setActiveTab('settings')} title="Settings">
            <Settings size={18} />
          </button>
          <button type="button" className="comix-icon-btn" onClick={() => setActiveTab('notifications')} title="Notifications">
            <Bell size={18} />
          </button>
          <div className="comix-profile-menu-wrap" ref={profileMenuRef}>
            <button
              type="button"
              className="comix-user-circle"
              title={session.user.email || 'Admin user'}
              aria-label="Open profile shortcuts"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              {userInitial}
            </button>
            {profileMenuOpen && (
              <div className="comix-profile-menu" role="menu" aria-label="Profile shortcuts">
                <div className="comix-profile-menu-heading">
                  <div className="comix-profile-menu-avatar">{userInitial}</div>
                  <div className="comix-profile-menu-identity">
                    <strong>{displayName}</strong>
                    {session.user.email && <span>{session.user.email}</span>}
                  </div>
                </div>
                <div className="comix-profile-menu-links">
                  <button type="button" role="menuitem" onClick={() => { setActiveTab('edit-profile'); setProfileMenuOpen(false); }}>
                    <UserCheck size={15} /> My Profile
                  </button>
                  <a href="/" role="menuitem" onClick={() => setProfileMenuOpen(false)}>
                    <Globe size={15} /> Public Site
                  </a>
                  <button type="button" role="menuitem" onClick={() => { setActiveTab('followed-titles'); setProfileMenuOpen(false); }}>
                    <Bookmark size={15} /> Followed Titles
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setActiveTab('read-history'); setProfileMenuOpen(false); }}>
                    <History size={15} /> Read History
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setActiveTab('collections'); setProfileMenuOpen(false); }}>
                    <FolderKanban size={15} /> Collections
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setActiveTab('notifications'); setProfileMenuOpen(false); }}>
                    <Bell size={15} /> Notifications
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setActiveTab('settings'); setProfileMenuOpen(false); }}>
                    <Settings size={15} /> Settings
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setActiveTab('uploads'); setProfileMenuOpen(false); }}>
                    <Upload size={15} /> Uploaded Chapters
                  </button>
                </div>
                <button type="button" className="comix-profile-menu-signout" role="menuitem" onClick={handleSignOut}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="comix-container">
        {/* Profile Banner Card */}
        <div className="comix-profile-card">
          <div className="comix-profile-user">
            <div className="comix-profile-avatar">
              {profileAvatarUrl ? (
                <img
                  src={profileAvatarUrl}
                  alt={displayName}
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                userInitial
              )}
            </div>
            <div className="comix-profile-details">
              <h2>{displayName}</h2>
              <span className="comix-profile-role">ADMIN / SCANLATOR</span>
            </div>
          </div>

          <div className="comix-stats-row">
            <div className="comix-stat-col">
              <span className="comix-stat-number">{catalogCountQuery.isPending ? '…' : totalTitleCount}</span>
              <span className="comix-stat-label">Titles</span>
            </div>
            <div className="comix-stat-col">
              <span className="comix-stat-number">{activeTab !== 'import-export' ? '—' : catalogQuery.isPending ? '…' : totalGroups}</span>
              <span className="comix-stat-label">Groups</span>
            </div>
            <div className="comix-stat-col">
              <span className="comix-stat-number">{activeTab !== 'import-export' ? '—' : catalogQuery.isPending ? '…' : totalChapters}</span>
              <span className="comix-stat-label">Chapters</span>
            </div>
            <div className="comix-stat-col">
              <span className="comix-stat-number">0</span>
              <span className="comix-stat-label">Comments</span>
            </div>
            <div className="comix-stat-col">
              <span className="comix-stat-number">0</span>
              <span className="comix-stat-label">Likes</span>
            </div>
          </div>
        </div>

        {/* Dashboard 2-Column Grid */}
        <div className="comix-layout-grid">
          <div className={`comix-mobile-nav ${mobileNavOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="comix-mobile-nav-trigger"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {(() => {
                const selected = allSidebarItems.find((item) => item.id === activeTab) ?? allSidebarItems[0];
                const SelectedIcon = selected.Icon;
                return <><SelectedIcon size={16} /><span>{selected.label}</span></>;
              })()}
              <ChevronDown size={16} className="comix-mobile-nav-chevron" />
            </button>
            {mobileNavOpen && (
              <div className="comix-mobile-nav-list">
                {sidebarSections.map((section) => (
                  <div key={section.category} className="comix-mobile-nav-section">
                    <div className="comix-sidebar-heading">{section.category}</div>
                    {section.items.map(({ id, label, Icon, badgeType }) => (
                      <button
                        type="button"
                        key={id}
                        className={`comix-mobile-nav-option ${activeTab === id ? 'is-active' : ''}`}
                        onClick={() => {
                          setActiveTab(id);
                          setMobileNavOpen(false);
                        }}
                      >
                        <Icon size={16} />
                        <span>{label}</span>
                        {badgeType === 'uploads' && (
                          <span className="nav-badge">{catalogCountQuery.isPending ? '…' : totalTitleCount}</span>
                        )}
                        {badgeType === 'supporters' && (
                          <span className="nav-badge">{supportersDraft.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Left Sidebar (Grouped & Categorized) */}
          <aside className="comix-sidebar">
            {sidebarSections.map((section, idx) => (
              <div key={section.category} className="comix-sidebar-section">
                <div className="comix-sidebar-heading">{section.category}</div>
                {section.items.map(({ id, label, Icon, badgeType }) => (
                  <button
                    type="button"
                    key={id}
                    className={`comix-nav-item ${activeTab === id ? 'is-active' : ''}`}
                    onClick={() => setActiveTab(id)}
                  >
                    <Icon size={16} className="nav-icon" />
                    <span>{label}</span>
                    {badgeType === 'uploads' && (
                      <span className="nav-badge">{catalogCountQuery.isPending ? '…' : totalTitleCount}</span>
                    )}
                    {badgeType === 'supporters' && (
                      <span className="nav-badge">{supportersDraft.length}</span>
                    )}
                  </button>
                ))}
                {idx < sidebarSections.length - 1 && <div className="comix-sidebar-divider" />}
              </div>
            ))}
          </aside>

          {/* Right Main Content */}
          <main className="comix-main-panel">
            {/* 1. UPLOADS / SERIES CATALOG (Default) */}
            {activeTab === 'uploads' && (
              <SeriesCatalogManager
                globalSearch={topSearch}
                newSeriesOrder={settings?.newSeriesOrder ?? []}
                customSourceNames={settings?.customSourceNames ?? DEFAULT_CUSTOM_SOURCE_NAMES}
                onSaveNewSeriesOrder={saveNewSeriesOrder}
                isSavingNewSeriesOrder={savingSettings || !settings}
                newSeriesOrderSaveMessage={saveMessage}
              />
            )}

            {/* 2. HERO SLIDES MANAGER */}
            {activeTab === 'hero-slides' && (
              <HeroSlidesManager settings={settings} onSave={(updated) => setSettings(updated)} />
            )}

            {activeTab === 'featured-series' && (
              <FeaturedSpotlightManager settings={settings} onSave={(updated) => setSettings(updated)} />
            )}

            {/* 3. SETTINGS (Homepage, Header, Series Page toggles) */}
            {activeTab === 'settings' && (
              <div className="comix-settings-card">
                <div className="comix-card-header">
                  <div>
                    <h3>Site Configuration</h3>
                    <p>Turn on or hide sections on your public pages.</p>
                  </div>
                  <div className={`comix-save-badge ${savingSettings ? 'saving' : ''}`}>
                    {savingSettings ? <LoaderCircle className="spin-icon" size={14} /> : <Check size={14} />}
                    {saveMessage}
                  </div>
                </div>

                <div className="comix-tab-pill-row">
                  <button
                    type="button"
                    className={`comix-sub-tab ${settingsSubTab === 'homepage' ? 'is-active' : ''}`}
                    onClick={() => setSettingsSubTab('homepage')}
                  >
                    Homepage Sections
                  </button>
                  <button
                    type="button"
                    className={`comix-sub-tab ${settingsSubTab === 'announcement' ? 'is-active' : ''}`}
                    onClick={() => setSettingsSubTab('announcement')}
                  >
                    Announcement
                  </button>
                  <button
                    type="button"
                    className={`comix-sub-tab ${settingsSubTab === 'header' ? 'is-active' : ''}`}
                    onClick={() => setSettingsSubTab('header')}
                  >
                    Header Items
                  </button>
                  <button
                    type="button"
                    className={`comix-sub-tab ${settingsSubTab === 'series' ? 'is-active' : ''}`}
                    onClick={() => setSettingsSubTab('series')}
                  >
                    Series Page Features
                  </button>
                  <button
                    type="button"
                    className={`comix-sub-tab ${settingsSubTab === 'filters' ? 'is-active' : ''}`}
                    onClick={() => setSettingsSubTab('filters')}
                  >
                    Series Filters
                  </button>
                  <button
                    type="button"
                    className={`comix-sub-tab ${settingsSubTab === 'socials' ? 'is-active' : ''}`}
                    onClick={() => setSettingsSubTab('socials')}
                  >
                    Social Links
                  </button>
                  <button
                    type="button"
                    className={`comix-sub-tab ${settingsSubTab === 'sources' ? 'is-active' : ''}`}
                    onClick={() => setSettingsSubTab('sources')}
                  >
                    Source Names
                  </button>
                  <button
                    type="button"
                    className={`comix-sub-tab ${settingsSubTab === 'theme' ? 'is-active' : ''}`}
                    onClick={() => setSettingsSubTab('theme')}
                  >
                    Theme
                  </button>
                </div>

                {settings && settingsSubTab === 'homepage' && (
                  <div>
                    {['Featured content', 'Promotions', 'Discovery', 'Community', 'Site information'].map((group) => {
                      const options = homepageVisibilityOptions.filter((o) => o.group === group);
                      if (!options.length) return null;
                      return (
                        <div key={group} className="comix-setting-group">
                          <div className="comix-group-title">{group}</div>
                          {options.map((opt) => (
                            <div key={opt.key} className="comix-setting-item">
                              <div className="comix-setting-info">
                                <strong>{opt.label}</strong>
                                <span>{opt.description}</span>
                              </div>
                              <button
                                type="button"
                                className={`comix-switch ${settings.homepage[opt.key] ? 'is-active' : ''}`}
                                onClick={() => handleToggle('homepage', opt.key)}
                                aria-label={`Toggle ${opt.label}`}
                              >
                                <span className="comix-switch-knob" />
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {settings && settingsSubTab === 'announcement' && (
                  <div className="comix-setting-group">
                    <div className="comix-group-title">Homepage announcement</div>
                    <p className="comix-announcement-help">Edit the message shown above Recently Viewed. The date updates automatically when you save.</p>
                    <div className="comix-announcement-form">
                      <label>
                        <span>Title</span>
                        <input
                          className="comix-announcement-input"
                          maxLength={120}
                          value={announcementDraft.title}
                          onChange={(event) => setAnnouncementDraft({ ...announcementDraft, title: event.target.value })}
                          placeholder="Announcement title"
                        />
                      </label>
                      <label>
                        <span>Content</span>
                        <textarea
                          className="comix-announcement-input comix-announcement-textarea"
                          maxLength={1200}
                          value={announcementDraft.content}
                          onChange={(event) => setAnnouncementDraft({ ...announcementDraft, content: event.target.value })}
                          placeholder="Write your announcement"
                          rows={5}
                        />
                      </label>
                      <label>
                        <span>Tags <small>(comma separated, up to 5)</small></span>
                        <input
                          className="comix-announcement-input"
                          maxLength={160}
                          value={announcementTagsInput}
                          onChange={(event) => setAnnouncementTagsInput(event.target.value)}
                          placeholder="Early access, Service update"
                        />
                      </label>
                      <div className="comix-announcement-date">
                        <strong>Current date</strong>
                        <span>{new Date(settings.announcement.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · refreshed on save</span>
                      </div>
                      <button type="button" className="comix-announcement-save" onClick={saveAnnouncement} disabled={savingSettings}>
                        {savingSettings ? <LoaderCircle className="spin-icon" size={15} /> : <Check size={15} />}
                        {savingSettings ? 'Saving...' : 'Save Announcement'}
                      </button>
                    </div>
                  </div>
                )}

                {settings && settingsSubTab === 'header' && (
                  <div>
                    {['Navigation', 'Reader tools', 'Community'].map((group) => {
                      const options = headerVisibilityOptions.filter((o) => o.group === group);
                      if (!options.length) return null;
                      return (
                        <div key={group} className="comix-setting-group">
                          <div className="comix-group-title">{group}</div>
                          {options.map((opt) => (
                            <div key={opt.key} className="comix-setting-item">
                              <div className="comix-setting-info">
                                <strong>{opt.label}</strong>
                                <span>{opt.description}</span>
                              </div>
                              <button
                                type="button"
                                className={`comix-switch ${settings.header[opt.key] ? 'is-active' : ''}`}
                                onClick={() => handleToggle('header', opt.key)}
                                aria-label={`Toggle ${opt.label}`}
                              >
                                <span className="comix-switch-knob" />
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {settings && settingsSubTab === 'series' && (
                  <div>
                    {['Series overview', 'Information tabs', 'Community and discovery'].map((group) => {
                      const options = seriesPageVisibilityOptions.filter((o) => o.group === group);
                      if (!options.length) return null;
                      return (
                        <div key={group} className="comix-setting-group">
                          <div className="comix-group-title">{group}</div>
                          {options.map((opt) => (
                            <div key={opt.key} className="comix-setting-item">
                              <div className="comix-setting-info">
                                <strong>{opt.label}</strong>
                                <span>{opt.description}</span>
                              </div>
                              <button
                                type="button"
                                className={`comix-switch ${settings.seriesPage[opt.key] ? 'is-active' : ''}`}
                                onClick={() => handleToggle('seriesPage', opt.key)}
                                aria-label={`Toggle ${opt.label}`}
                              >
                                <span className="comix-switch-knob" />
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}

                {settings && settingsSubTab === 'filters' && (
                  <div>
                    <div className="comix-setting-group">
                      <div className="comix-group-title">Series page filters</div>
                      {seriesFilterVisibilityOptions.map((opt) => (
                        <div key={opt.key} className="comix-setting-item">
                          <div className="comix-setting-info">
                            <strong>{opt.label}</strong>
                            <span>{opt.description}</span>
                          </div>
                          <button
                            type="button"
                            className={`comix-switch ${settings.seriesFilters[opt.key] ? 'is-active' : ''}`}
                            onClick={() => handleToggle('seriesFilters', opt.key)}
                            aria-label={`Toggle ${opt.label} filter`}
                            aria-pressed={settings.seriesFilters[opt.key]}
                          >
                            <span className="comix-switch-knob" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {settings && settingsSubTab === 'socials' && (
                  <div>
                    <div className="comix-setting-group">
                      <div className="comix-group-title">Social Links</div>
                      <div className="comix-setting-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px' }}>
                        <div className="comix-setting-info" style={{ width: '100%' }}>
                          <strong>Facebook Page URL</strong>
                          <span>The destination URL for the &quot;Join Our Socials&quot; Facebook button on the homepage and series page.</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '560px' }}>
                          <input
                            type="url"
                            className="comix-search-input"
                            style={{
                              flex: 1,
                              height: '40px',
                              padding: '0 14px',
                              borderRadius: '6px',
                              border: '1px solid var(--cx-border)',
                              background: 'var(--cx-input-bg)',
                              color: 'var(--cx-text)',
                              outline: 'none',
                              fontSize: '13px',
                            }}
                            placeholder="https://facebook.com/yourpage"
                            value={facebookUrlInput}
                            onChange={(e) => setFacebookUrlInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void saveFacebookUrl();
                              }
                            }}
                          />
                          <button
                            type="button"
                            style={{
                              height: '40px',
                              padding: '0 18px',
                              borderRadius: '6px',
                              background: '#1877F2',
                              color: '#ffffff',
                              border: 'none',
                              fontWeight: 600,
                              fontSize: '13px',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              transition: 'opacity 0.15s ease',
                            }}
                            onClick={saveFacebookUrl}
                            disabled={savingSettings}
                          >
                            {savingSettings ? 'Saving...' : 'Save Link'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {settings && settingsSubTab === 'sources' && (
                  <div className="comix-setting-group">
                    <div className="comix-group-title">Custom source names</div>
                    <div className="comix-setting-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                      <div className="comix-setting-info">
                        <strong>
                          Upload source suggestions
                          <small className="custom-source-name-count">{customSourceNamesDraft.length} total</small>
                        </strong>
                        <span>Add source names here before using them on a series. Series source names must be selected from this saved list, which appears in alphabetical order.</span>
                      </div>
                      <div className="custom-source-name-editor">
                        <label className="custom-source-name-search">
                          <Search size={16} aria-hidden="true" />
                          <input
                            type="search"
                            aria-label="Search saved source names"
                            placeholder="Search source names..."
                            value={customSourceNamesSearch}
                            onChange={(event) => setCustomSourceNamesSearch(event.target.value)}
                          />
                          {customSourceNamesSearch && (
                            <button type="button" aria-label="Clear source name search" onClick={() => setCustomSourceNamesSearch('')}>
                              <X size={14} />
                            </button>
                          )}
                        </label>
                        {groupedCustomSourceNames.length > 0 && (
                          <div className="custom-source-name-groups" aria-label="Saved source names, grouped alphabetically">
                            {groupedCustomSourceNames.map(([letter, names]) => (
                              <section className="custom-source-name-group" key={letter} aria-labelledby={`custom-source-group-${letter}`}>
                                <h3 id={`custom-source-group-${letter}`} className="custom-source-name-letter">{letter}</h3>
                                <div className="custom-source-name-chips">
                                  {names.map((name) => (
                                    <span key={name.toLocaleLowerCase()} className="custom-source-name-chip">
                                      {name}
                                      <button
                                        type="button"
                                        onClick={() => setCustomSourceNamesDraft((current) => current.filter((item) => item.toLocaleLowerCase() !== name.toLocaleLowerCase()))}
                                        disabled={savingSettings}
                                        aria-label={`Remove ${name}`}
                                        title={`Remove ${name}`}
                                      >
                                        <X size={13} />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        )}
                        {groupedCustomSourceNames.length === 0 && (
                          <p className="custom-source-name-no-results" role="status">
                            {customSourceNamesSearch.trim() ? 'No source names match your search.' : 'No source names saved yet.'}
                          </p>
                        )}
                        <form
                          className="custom-source-name-add-row"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const name = customSourceNameInput.trim();
                            if (!name || customSourceNamesDraft.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
                            setCustomSourceNamesDraft((current) => [...current, name].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
                            setCustomSourceNameInput('');
                          }}
                        >
                          <input
                            type="text"
                            className="comix-announcement-input"
                            aria-label="Add a source name"
                            placeholder="Add source name..."
                            value={customSourceNameInput}
                            onChange={(event) => setCustomSourceNameInput(event.target.value)}
                            disabled={savingSettings}
                          />
                          <button type="submit" className="custom-source-name-add-button" disabled={!customSourceNameInput.trim() || savingSettings} aria-label="Add source name">
                            <Plus size={16} />
                            <span>Add</span>
                          </button>
                        </form>
                      </div>
                      <button
                        type="button"
                        className="btn-teal"
                        style={{ alignSelf: 'flex-start' }}
                        onClick={() => void saveCustomSourceNames()}
                        disabled={savingSettings}
                      >
                        {savingSettings ? 'Saving...' : 'Save source names'}
                      </button>
                    </div>
                  </div>
                )}

                {settings && settingsSubTab === 'theme' && (
                  <div className="comix-setting-group">
                    <div className="comix-group-title">Site accent theme</div>
                    <p className="comix-theme-description">Choose the accent color used across the public site and admin pages. The current orange palette is saved as Halloween.</p>
                    <div className="comix-theme-options">
                      <button
                        type="button"
                        className={`comix-theme-option is-default ${settings.accentTheme === 'default' ? 'is-selected' : ''}`}
                        onClick={() => void saveAccentTheme('default')}
                        disabled={savingSettings}
                        aria-pressed={settings.accentTheme === 'default'}
                      >
                        <span className="comix-theme-swatch" aria-hidden="true" />
                        <span className="comix-theme-option-copy"><strong>Default</strong><small>Red accents</small></span>
                        {settings.accentTheme === 'default' && <Check size={17} />}
                      </button>
                      <button
                        type="button"
                        className={`comix-theme-option is-halloween ${settings.accentTheme === 'halloween' ? 'is-selected' : ''}`}
                        onClick={() => void saveAccentTheme('halloween')}
                        disabled={savingSettings}
                        aria-pressed={settings.accentTheme === 'halloween'}
                      >
                        <span className="comix-theme-swatch" aria-hidden="true" />
                        <span className="comix-theme-option-copy"><strong>Halloween</strong><small>Orange accents</small></span>
                        {settings.accentTheme === 'halloween' && <Check size={17} />}
                      </button>
                    </div>
                    <div className="comix-setting-item">
                      <div className="comix-setting-info">
                        <strong><Palette size={15} /> Active theme</strong>
                        <span>{settings.accentTheme === 'halloween' ? 'Halloween · orange accent palette' : 'Default · red accent palette'}</span>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* DONATION SUPPORTERS */}
            {activeTab === 'donation-supporters' && (
              <div
                className="comix-tab-pill-row"
                style={{ border: '1px solid var(--cx-border)', borderRadius: 12, marginBottom: 16, background: 'var(--cx-surface)', padding: '10px 12px' }}
                role="tablist"
                aria-label="Donation page sections"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={donationTab === 'supporters'}
                  className={`comix-sub-tab ${donationTab === 'supporters' ? 'is-active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setDonationTab('supporters')}
                >
                  <Users size={14} />
                  <span>Supporters</span>
                  <span className="comix-order-count">{supportersDraft.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={donationTab === 'methods'}
                  className={`comix-sub-tab ${donationTab === 'methods' ? 'is-active' : ''}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setDonationTab('methods')}
                >
                  <Heart size={14} />
                  <span>Support Methods</span>
                  <span className="comix-order-count">{(settings?.supportMethods ?? DEFAULT_SUPPORT_METHODS).length}</span>
                </button>
              </div>
            )}

            {activeTab === 'donation-supporters' && donationTab === 'methods' && (
              <SupportMethodsManager
                methods={settings?.supportMethods ?? DEFAULT_SUPPORT_METHODS}
                saving={savingSettings}
                onSave={saveSupportMethods}
              />
            )}

            {activeTab === 'donation-supporters' && donationTab === 'supporters' && (
              <div className="comix-settings-card">
                <div className="comix-setting-group">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                      <div>
                        <div className="comix-group-title" style={{ marginBottom: 4 }}>Donation Supporters Manager</div>
                        <p className="comix-theme-description" style={{ margin: 0 }}>
                          Add, customize, and manage donors shown on the /donate page. Auto-increment anonymous supporters or showcase their actual names.
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 13, borderRadius: 8, cursor: 'pointer' }}
                          onClick={handleExportSupporters}
                          disabled={savingSettings}
                          title="Download all current supporters as a JSON backup file"
                        >
                          <Download size={14} />
                          <span>Export Backup</span>
                        </button>
                        <button
                          type="button"
                          className="btn-teal"
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', fontSize: 13, borderRadius: 8, cursor: 'pointer' }}
                          onClick={openNewSupporterModal}
                          disabled={savingSettings}
                        >
                          <Plus size={16} />
                          <span>Add Supporter</span>
                        </button>
                      </div>
                    </div>

                    {/* Stats Highlights */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
                      <div style={{ background: 'var(--cx-surface)', border: '1px solid var(--cx-border)', borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--cx-text-muted)', fontWeight: 600 }}>Total Supporters</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cx-text)', marginTop: 2 }}>{supportersDraft.length}</div>
                      </div>
                      <div style={{ background: 'var(--cx-surface)', border: '1px solid var(--cx-border)', borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--cx-text-muted)', fontWeight: 600 }}>Total Raised</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--cx-teal)', marginTop: 2 }}>
                          ${supportersDraft.reduce((acc, s) => acc + (parseFloat(s.amount.replace(/[^0-9.]/g, '')) || 0), 0).toFixed(2)}
                        </div>
                      </div>
                      <div style={{ background: 'var(--cx-surface)', border: '1px solid var(--cx-border)', borderRadius: 10, padding: '12px 16px' }}>
                        <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--cx-text-muted)', fontWeight: 600 }}>Next Anonymous Count</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6', marginTop: 2 }}>
                          #{getNextAnonymousNumber()}
                        </div>
                      </div>
                    </div>

                    {/* Filter & Search Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {(['all', 'anonymous', 'named', 'podium'] as const).map((filter) => (
                          <button
                            key={filter}
                            type="button"
                            className={`comix-sub-tab ${supporterFilter === filter ? 'is-active' : ''}`}
                            style={{ padding: '4px 10px', fontSize: 12, height: 'auto', textTransform: 'capitalize' }}
                            onClick={() => setSupporterFilter(filter)}
                          >
                            {filter}
                          </button>
                        ))}
                      </div>
                      <div style={{ position: 'relative', minWidth: 220 }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--cx-text-muted)' }} />
                        <input
                          type="search"
                          placeholder="Search supporters..."
                          value={supporterSearch}
                          onChange={(e) => setSupporterSearch(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '6px 10px 6px 30px',
                            borderRadius: 8,
                            border: '1px solid var(--cx-border)',
                            background: 'var(--cx-surface)',
                            color: 'var(--cx-text)',
                            fontSize: 13,
                          }}
                        />
                      </div>
                    </div>

                    {/* Supporters List Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                      {supportersDraft
                        .filter((s) => {
                          const computedRank = podiumRankMap.get(s.id);
                          if (supporterFilter === 'anonymous' && !s.isAnonymous) return false;
                          if (supporterFilter === 'named' && s.isAnonymous) return false;
                          if (supporterFilter === 'podium' && !computedRank) return false;
                          if (supporterSearch.trim()) {
                            const q = supporterSearch.toLowerCase();
                            return s.name.toLowerCase().includes(q) || (s.actualName && s.actualName.toLowerCase().includes(q));
                          }
                          return true;
                        })
                        .map((s) => {
                          const computedRank = podiumRankMap.get(s.id);
                          const isPodium = Boolean(computedRank);
                          const rankColor = computedRank === 1 ? '#D4A017' : computedRank === 2 ? '#9AA6B2' : computedRank === 3 ? '#B87333' : 'transparent';
                          return (
                            <div
                              key={s.id}
                              style={{
                                background: 'var(--cx-surface)',
                                border: isPodium ? `1.5px solid ${rankColor}` : '1px solid var(--cx-border)',
                                borderRadius: 12,
                                padding: '10px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {/* Avatar */}
                              <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
                                <img
                                  src={getDiceBearAvatar(s.name)}
                                  alt={s.name}
                                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', background: '#e2e8f0' }}
                                />
                                {isPodium && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: -3,
                                      right: -3,
                                      width: 16,
                                      height: 16,
                                      borderRadius: '50%',
                                      background: rankColor,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: '#fff',
                                      fontSize: 9,
                                      fontWeight: 800,
                                    }}
                                  >
                                    {computedRank}
                                  </div>
                                )}
                              </div>
                              {/* Name + meta */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--cx-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>
                                  {s.name}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 5px', marginTop: 3 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: s.isAnonymous ? '#3b82f6' : '#10b981', background: s.isAnonymous ? '#eff6ff' : '#f0fdf4', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                                    {s.isAnonymous ? 'Anonymous' : 'Actual Name'}
                                  </span>
                                  <span style={{ fontSize: 11, color: 'var(--cx-text-muted)', whiteSpace: 'nowrap' }}>{s.count} donation{s.count > 1 ? 's' : ''}</span>
                                  <span style={{ fontSize: 11, color: 'var(--cx-text-muted)', whiteSpace: 'nowrap' }}>· {getSupporterDisplayTime(s, nowTick)}</span>
                                </div>
                              </div>
                              {/* Amount + actions */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--cx-text)', whiteSpace: 'nowrap' }}>{s.amount}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <button
                                    type="button"
                                    onClick={() => openEditSupporterModal(s)}
                                    disabled={savingSettings}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--cx-text-muted)', cursor: 'pointer', padding: '3px 5px', borderRadius: 4, lineHeight: 1 }}
                                    title="Edit supporter"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSupporterToDelete(s)}
                                    disabled={savingSettings}
                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '3px 5px', borderRadius: 4, lineHeight: 1 }}
                                    title="Delete supporter"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    {/* Add / Edit Supporter Modal */}
                    {showSupporterModal && (
                      <div
                        className="supporter-modal-backdrop"
                        onClick={() => setShowSupporterModal(false)}
                      >
                        <div
                          className="supporter-modal"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="supporter-modal-header">
                            <h3>
                              {editingSupporterId === 'new' ? 'Add Supporter' : 'Edit Supporter'}
                            </h3>
                            <button
                              type="button"
                              className="supporter-modal-close"
                              onClick={() => setShowSupporterModal(false)}
                            >
                              <X size={18} />
                            </button>
                          </div>

                          {/* Identity Mode Switch: Anonymous vs Actual Name */}
                          <div style={{ marginBottom: 16 }}>
                            <label className="supporter-modal-label">
                              Supporter Identity Mode
                            </label>
                            <div className="supporter-identity-grid">
                              <button
                                type="button"
                                className={`supporter-identity-btn ${supporterForm.isAnonymous ? 'is-anonymous' : 'is-anonymous-inactive'}`}
                                onClick={() => {
                                  const num = supporterForm.anonymousNumber || getNextAnonymousNumber();
                                  if (nameError) setNameError('');
                                  setSupporterForm({ ...supporterForm, isAnonymous: true, anonymousNumber: num });
                                }}
                              >
                                {supporterForm.isAnonymous && <Check size={14} />}
                                <span>Anonymous (Auto #)</span>
                              </button>
                              <button
                                type="button"
                                className={`supporter-identity-btn ${!supporterForm.isAnonymous ? 'is-named' : 'is-named-inactive'}`}
                                onClick={() => setSupporterForm({ ...supporterForm, isAnonymous: false })}
                              >
                                {!supporterForm.isAnonymous && <Check size={14} />}
                                <span>Show Actual Name</span>
                              </button>
                            </div>
                          </div>

                          {/* Dynamic Name Input */}
                          {supporterForm.isAnonymous ? (
                            <div style={{ marginBottom: 16 }}>
                              <label className="supporter-modal-label-sm">
                                Anonymous Number (Auto-Incremented)
                              </label>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--cx-text-muted)' }}>Anonymous #</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={supporterForm.anonymousNumber}
                                  onChange={(e) => setSupporterForm({ ...supporterForm, anonymousNumber: parseInt(e.target.value, 10) || 1 })}
                                  className="supporter-modal-input"
                                  style={{ flex: 1, fontWeight: 600 }}
                                />
                              </div>
                              <small style={{ display: 'block', color: 'var(--cx-text-muted)', fontSize: 11, marginTop: 4 }}>
                                Next available number automatically calculated. You can also adjust manually.
                              </small>
                            </div>
                          ) : (
                            <div style={{ marginBottom: 16 }}>
                              <label className="supporter-modal-label-sm">
                                Actual Supporter Name <span style={{ color: '#ef4444' }}>*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. grazzhella Vicente, Anna domi"
                                required
                                value={supporterForm.actualName}
                                onChange={(e) => {
                                  setSupporterForm({ ...supporterForm, actualName: e.target.value });
                                  if (nameError) setNameError('');
                                }}
                                className="supporter-modal-input"
                                style={{ borderColor: nameError ? '#ef4444' : undefined }}
                              />
                              {nameError && (
                                <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>
                                  {nameError}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Live Avatar Preview */}
                          <div className="supporter-preview-box">
                            <img
                              src={getDiceBearAvatar(supporterForm.isAnonymous ? `Anonymous #${supporterForm.anonymousNumber}` : supporterForm.actualName || 'Supporter')}
                              alt="Preview Avatar"
                              style={{ width: 40, height: 40, borderRadius: '50%', background: '#e2e8f0', flexShrink: 0 }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--cx-text-muted)', fontWeight: 600 }}>Card Preview Name</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cx-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {supporterForm.isAnonymous ? `Anonymous #${supporterForm.anonymousNumber}` : supporterForm.actualName || '(Enter Name Above)'}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--cx-text-muted)', marginTop: 2 }}>
                                {supporterForm.amount.trim() ? `$${supporterForm.amount.replace(/^\$/, '')}` : '$0.00'} · {livePreviewTime} · {supporterForm.count} donation{supporterForm.count > 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>

                          {/* Amount & Count */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div>
                              <label className="supporter-modal-label-sm">
                                Amount ($ USD) <span style={{ color: '#ef4444' }}>*</span>
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. 5.00"
                                required
                                value={supporterForm.amount}
                                onChange={(e) => {
                                  setSupporterForm({ ...supporterForm, amount: e.target.value });
                                  if (amountError) setAmountError('');
                                }}
                                className="supporter-modal-input"
                                style={{ borderColor: amountError ? '#ef4444' : undefined }}
                              />
                              {amountError && (
                                <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>
                                  {amountError}
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="supporter-modal-label-sm">
                                Donation Count
                              </label>
                              <input
                                type="number"
                                min={1}
                                value={supporterForm.count}
                                onChange={(e) => setSupporterForm({ ...supporterForm, count: parseInt(e.target.value, 10) || 1 })}
                                className="supporter-modal-input"
                              />
                            </div>
                          </div>

                          {/* Time Ago & Preset chips */}
                          <div style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <label className="supporter-modal-label-sm" style={{ margin: 0 }}>
                                Time Ago / Display Date
                              </label>
                              <span style={{ fontSize: 11, color: 'var(--cx-text-muted)' }}>
                                {supporterForm.timeMode === 'auto'
                                  ? 'Auto-updates from save'
                                  : supporterForm.timeMode === 'custom'
                                  ? 'Custom relative auto-timer'
                                  : 'Preset relative auto-timer'}
                              </span>
                            </div>

                            {/* Mode Toggle */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                              <button
                                type="button"
                                className={`supporter-time-mode-btn ${supporterForm.timeMode === 'auto' ? 'is-active' : ''}`}
                                onClick={() => setSupporterForm({ ...supporterForm, timeMode: 'auto' })}
                              >
                                <Clock size={13} />
                                <span>Auto (Now)</span>
                              </button>
                              <button
                                type="button"
                                className={`supporter-time-mode-btn ${supporterForm.timeMode === 'custom' ? 'is-active' : ''}`}
                                onClick={() => setSupporterForm({ ...supporterForm, timeMode: 'custom' })}
                              >
                                <History size={13} />
                                <span>Custom Time</span>
                              </button>
                              <button
                                type="button"
                                className={`supporter-time-mode-btn ${supporterForm.timeMode === 'manual' ? 'is-active' : ''}`}
                                onClick={() => setSupporterForm({ ...supporterForm, timeMode: 'manual' })}
                              >
                                <History size={13} />
                                <span>Preset Timer</span>
                              </button>
                            </div>

                            {/* 1. Auto Timer Mode */}
                            {supporterForm.timeMode === 'auto' && (
                              <div style={{
                                background: 'var(--cx-surface)',
                                border: '1px solid var(--cx-border)',
                                borderRadius: 10,
                                padding: '12px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                              }}>
                                <div style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 8,
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  color: '#3b82f6',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}>
                                  <Clock size={16} />
                                </div>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--cx-text)' }}>
                                    Live Auto Timer Active
                                  </div>
                                  <div style={{ fontSize: 12, color: 'var(--cx-text-muted)', marginTop: 2 }}>
                                    Will save with current timestamp and auto-progress (<strong>Just now</strong> → <strong>1m ago</strong> → <strong>2h ago</strong>).
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* 2. Custom Time Mode */}
                            {supporterForm.timeMode === 'custom' && (
                              <div>
                                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, marginBottom: 8 }}>
                                  <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--cx-text-muted)', marginBottom: 4 }}>
                                      Count
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={999}
                                      value={supporterForm.customAmount}
                                      onChange={(e) => setSupporterForm({ ...supporterForm, customAmount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                                      className="supporter-modal-input"
                                      style={{ fontWeight: 600 }}
                                    />
                                  </div>
                                  <div>
                                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--cx-text-muted)', marginBottom: 4 }}>
                                      Unit
                                    </label>
                                    <select
                                      value={supporterForm.customUnit}
                                      onChange={(e) => setSupporterForm({ ...supporterForm, customUnit: e.target.value as any })}
                                      className="supporter-modal-select"
                                    >
                                      <option value="minutes">Minutes ago</option>
                                      <option value="hours">Hours ago</option>
                                      <option value="days">Days ago</option>
                                      <option value="months">Months ago</option>
                                      <option value="years">Years ago</option>
                                    </select>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                  <span style={{ fontSize: 11, color: 'var(--cx-text-muted)', marginRight: 2 }}>Presets:</span>
                                  {[
                                    { label: '5m', amount: 5, unit: 'minutes' as const },
                                    { label: '30m', amount: 30, unit: 'minutes' as const },
                                    { label: '2h', amount: 2, unit: 'hours' as const },
                                    { label: '12h', amount: 12, unit: 'hours' as const },
                                    { label: '1d', amount: 1, unit: 'days' as const },
                                    { label: '3d', amount: 3, unit: 'days' as const },
                                    { label: '1mo', amount: 1, unit: 'months' as const },
                                    { label: '1y', amount: 1, unit: 'years' as const },
                                  ].map((p) => {
                                    const isActive = supporterForm.customAmount === p.amount && supporterForm.customUnit === p.unit;
                                    return (
                                      <button
                                        key={p.label}
                                        type="button"
                                        className={`supporter-time-chip ${isActive ? 'is-active' : ''}`}
                                        onClick={() => setSupporterForm({ ...supporterForm, customAmount: p.amount, customUnit: p.unit })}
                                      >
                                        {p.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* 3. Preset Timer Mode */}
                            {supporterForm.timeMode === 'manual' && (
                              <div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                                  {['Just now', 'Today', '2d ago', '1w ago', '1mo ago', '3mo ago', '5mo ago'].map((preset) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      className={`supporter-time-chip ${supporterForm.manualTime === preset ? 'is-active' : ''}`}
                                      onClick={() => setSupporterForm({ ...supporterForm, manualTime: preset })}
                                    >
                                      {preset}
                                    </button>
                                  ))}
                                </div>
                                <input
                                  type="text"
                                  placeholder="e.g. Just now, 2d ago, 5mo ago"
                                  value={supporterForm.manualTime}
                                  onChange={(e) => setSupporterForm({ ...supporterForm, manualTime: e.target.value })}
                                  className="supporter-modal-input"
                                  style={{ marginBottom: 4 }}
                                />
                                <small style={{ display: 'block', color: 'var(--cx-text-muted)', fontSize: 11 }}>
                                  Dynamic anchor: sets relative time in the past and dynamically moves forward after saving.
                                </small>
                              </div>
                            )}
                          </div>

                          <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--cx-text-muted)' }}>
                            ★ <strong>Podium Top 3:</strong> Automatically ranked 1st, 2nd, and 3rd based on the highest donation amount.
                          </p>

                          {/* Dialog Buttons */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setShowSupporterModal(false)}
                              style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn-teal"
                              onClick={handleSaveSupporterForm}
                              disabled={savingSettings}
                              style={{ padding: '8px 20px', borderRadius: 8, cursor: 'pointer' }}
                            >
                              {savingSettings ? 'Saving...' : 'Save Supporter'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Save Confirmation Modal */}
                    {showSaveConfirm && (
                      <div
                        className="supporter-modal-backdrop"
                        style={{ zIndex: 10001 }}
                        onClick={() => setShowSaveConfirm(false)}
                      >
                        <div
                          className="supporter-modal"
                          style={{ maxWidth: 440 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ textAlign: 'center', padding: '6px 0 16px' }}>
                            <div style={{
                              width: 48,
                              height: 48,
                              borderRadius: '50%',
                              background: 'rgba(59, 130, 246, 0.12)',
                              color: '#3b82f6',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              margin: '0 auto 12px',
                            }}>
                              <Check size={24} />
                            </div>
                            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--cx-text)' }}>
                              {editingSupporterId === 'new' ? 'Confirm Add Supporter' : 'Confirm Save Changes'}
                            </h3>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--cx-text-muted)', lineHeight: 1.45 }}>
                              {editingSupporterId === 'new'
                                ? 'Are you sure you want to add this supporter to the database?'
                                : 'Are you sure you want to save your edits to this supporter?'}
                            </p>
                          </div>

                          {/* Summary Box */}
                          <div style={{
                            background: 'var(--cx-surface)',
                            border: '1px solid var(--cx-border)',
                            borderRadius: 10,
                            padding: '12px 16px',
                            marginBottom: 20,
                            fontSize: 13,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ color: 'var(--cx-text-muted)' }}>Supporter:</span>
                              <strong style={{ color: 'var(--cx-text)' }}>
                                {supporterForm.isAnonymous ? `Anonymous #${supporterForm.anonymousNumber}` : supporterForm.actualName || 'Generous Supporter'}
                              </strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ color: 'var(--cx-text-muted)' }}>Amount:</span>
                              <strong style={{ color: 'var(--cx-teal)' }}>
                                ${supporterForm.amount.replace(/^\$/, '') || '5.00'}
                              </strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ color: 'var(--cx-text-muted)' }}>Donations:</span>
                              <strong style={{ color: 'var(--cx-text)' }}>
                                {supporterForm.count} donation{supporterForm.count > 1 ? 's' : ''}
                              </strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--cx-text-muted)' }}>Display Time:</span>
                              <strong style={{ color: 'var(--cx-text)' }}>
                                {livePreviewTime}
                              </strong>
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setShowSaveConfirm(false)}
                              disabled={savingSettings}
                              style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
                            >
                              Go Back & Review
                            </button>
                            <button
                              type="button"
                              className="btn-teal"
                              onClick={handleExecuteSave}
                              disabled={savingSettings}
                              style={{ padding: '8px 20px', borderRadius: 8, cursor: 'pointer' }}
                            >
                              {savingSettings ? 'Saving...' : 'Yes, Confirm & Save'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Delete Confirmation Modal */}
                    {supporterToDelete && (
                      <div
                        className="supporter-modal-backdrop"
                        style={{ zIndex: 10001 }}
                        onClick={() => setSupporterToDelete(null)}
                      >
                        <div
                          className="supporter-modal"
                          style={{ maxWidth: 440 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ textAlign: 'center', padding: '6px 0 16px' }}>
                            <div style={{
                              width: 50,
                              height: 50,
                              borderRadius: '50%',
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#ef4444',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              margin: '0 auto 12px',
                            }}>
                              <Trash2 size={24} />
                            </div>
                            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--cx-text)' }}>
                              Delete Supporter
                            </h3>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--cx-text-muted)', lineHeight: 1.45 }}>
                              Are you sure you want to permanently delete{' '}
                              <strong style={{ color: 'var(--cx-text)' }}>{supporterToDelete.name}</strong>?
                            </p>
                          </div>

                          <div style={{
                            background: 'var(--cx-surface)',
                            border: '1px solid var(--cx-border)',
                            borderRadius: 10,
                            padding: '12px 16px',
                            marginBottom: 20,
                            fontSize: 13,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <span style={{ color: 'var(--cx-text-muted)' }}>Amount:</span>
                              <strong style={{ color: 'var(--cx-text)' }}>{supporterToDelete.amount}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--cx-text-muted)' }}>Donations:</span>
                              <strong style={{ color: 'var(--cx-text)' }}>{supporterToDelete.count} donation{supporterToDelete.count > 1 ? 's' : ''}</strong>
                            </div>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setSupporterToDelete(null)}
                              disabled={savingSettings}
                              style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              style={{
                                background: '#ef4444',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 8,
                                padding: '8px 18px',
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: 'pointer',
                              }}
                              onClick={handleConfirmDelete}
                              disabled={savingSettings}
                            >
                              {savingSettings ? 'Deleting...' : 'Delete Supporter'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
            )}

            {/* 3. IMPORT / EXPORT */}
            {activeTab === 'import-export' && (
              <div className="comix-settings-card" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Import & Export Data</h3>
                <p style={{ color: 'var(--cx-text-muted)', marginBottom: 24, fontSize: 14 }}>
                  Backup catalog data or restore missing series from the baseline catalog.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Export Catalog */}

                  <div className="comix-setting-item" style={{ border: '1px solid var(--cx-border)', borderRadius: 8, padding: 16 }}>
                    <div>
                      <strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>Export Catalog JSON</strong>
                      <span style={{ fontSize: 13, color: 'var(--cx-text-muted)' }}>
                        Download a full snapshot of your current series database.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-dark"
                      disabled={catalogQuery.isPending}
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(catalogItems, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `catalog-export-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download size={15} /> {catalogQuery.isPending ? 'Loading catalog…' : 'Export JSON'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. EDIT PROFILE (COMICK / MANGADEX 2-COLUMN STYLE) */}
            {activeTab === 'edit-profile' && (
              <form className="comix-edit-profile-card" onSubmit={handleSaveProfile}>
                <div className="comix-edit-profile-header">
                  <h2>Edit Profile</h2>
                  <p>Update how you appear on the site. Email and password changes require confirmation.</p>
                </div>

                {profileFeedback && (
                  <div className={`comix-profile-feedback is-${profileFeedback.type}`}>
                    {profileFeedback.type === 'success' ? <Check size={16} /> : <ShieldAlert size={16} />}
                    <span>{profileFeedback.message}</span>
                  </div>
                )}

                {/* Hidden Avatar File Input */}
                <input
                  type="file"
                  ref={avatarFileInputRef}
                  onChange={handleAvatarFileSelect}
                  accept="image/png,image/jpeg,image/webp"
                  style={{ display: 'none' }}
                />

                {/* ROW 1: AVATAR */}
                <div className="comix-edit-profile-row">
                  <div className="comix-edit-profile-meta">
                    <h3>Avatar</h3>
                    <p>JPG, PNG or WebP, up to 1 MB.</p>
                  </div>
                  <div className="comix-edit-profile-fields">
                    <div className="comix-avatar-container">
                      <button
                        type="button"
                        className="comix-avatar-preview-btn"
                        onClick={() => avatarFileInputRef.current?.click()}
                        title="Click to choose a new avatar"
                      >
                        {profileAvatarUrl ? (
                          <img src={profileAvatarUrl} alt="Avatar Preview" />
                        ) : (
                          <span className="comix-avatar-initial">{userInitial}</span>
                        )}
                        <span className="comix-avatar-hover-overlay" aria-hidden="true">
                          <Camera size={15} className="comix-avatar-camera-icon" />
                          <span className="comix-avatar-edit-text">EDIT</span>
                        </span>
                      </button>
                      {profileAvatarUrl && (
                        <div className="comix-avatar-actions">
                          <button
                            type="button"
                            className="comix-avatar-action-btn"
                            onClick={() => setProfileAvatarUrl('')}
                            style={{ color: '#ef4444' }}
                          >
                            Remove avatar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ROW 2: IDENTITY */}
                <div className="comix-edit-profile-row">
                  <div className="comix-edit-profile-meta">
                    <h3>Identity</h3>
                    <p>Shown on your profile and next to your comments.</p>
                  </div>
                  <div className="comix-edit-profile-fields">
                    <div className="comix-edit-profile-grid-2">
                      <div className="comix-field-wrap">
                        <label className="comix-field-label">DISPLAY NAME</label>
                        <div className="comix-field-input-box">
                          <input
                            type="text"
                            maxLength={32}
                            value={profileDisplayName}
                            onChange={(e) => setProfileDisplayName(e.target.value)}
                            placeholder="Clyde Bustamante"
                          />
                        </div>
                        <div className="comix-field-footer">
                          <span>{profileDisplayName.length} / 32</span>
                        </div>
                      </div>

                      <div className="comix-field-wrap">
                        <label className="comix-field-label">USERNAME</label>
                        <div className="comix-field-input-box">
                          <span className="comix-field-input-prefix">@</span>
                          <input
                            type="text"
                            className="comix-input-with-prefix"
                            value={profileUsername}
                            onChange={(e) => setProfileUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                            placeholder="clydhex"
                          />
                        </div>
                        <div className="comix-field-footer">
                          <span>Lowercase letters, numbers, dot, underscore, hyphen.</span>
                        </div>
                      </div>
                    </div>

                    <div className="comix-field-wrap" style={{ marginTop: 16 }}>
                      <label className="comix-field-label">PROFILE ID</label>
                      <div className="comix-field-input-box">
                        <input
                          type="text"
                          readOnly
                          value={publicProfileId}
                          style={{ fontFamily: 'monospace', opacity: 0.85, paddingRight: 40 }}
                        />
                        <button
                          type="button"
                          className="comix-copy-btn"
                          onClick={handleCopyProfileId}
                          title="Copy Profile ID"
                        >
                          {copiedId ? <Check size={16} style={{ color: 'var(--cx-teal)' }} /> : <Copy size={16} />}
                        </button>
                      </div>
                      <div className="comix-field-footer">
                        <span>Your public profile ID — share it when reporting an issue.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ROW 3: BIO */}
                <div className="comix-edit-profile-row">
                  <div className="comix-edit-profile-meta">
                    <h3>Bio</h3>
                    <p>A short blurb shown on your public profile.</p>
                  </div>
                  <div className="comix-edit-profile-fields">
                    <div className="comix-field-wrap">
                      <label className="comix-field-label">ABOUT YOU</label>
                      <div className="comix-field-input-box">
                        <textarea
                          maxLength={500}
                          value={profileBio}
                          onChange={(e) => setProfileBio(e.target.value)}
                          placeholder="Tell readers a little about yourself..."
                        />
                      </div>
                      <div className="comix-field-footer">
                        <span>{profileBio.length} / 500</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ROW 4: SOCIAL LINKS */}
                <div className="comix-edit-profile-row">
                  <div className="comix-edit-profile-meta">
                    <h3>Social links</h3>
                    <p>Optional. One link per line — each must start with http(s):// and stay under 255 characters, max 5 links.</p>
                  </div>
                  <div className="comix-edit-profile-fields">
                    <div className="comix-field-wrap">
                      <label className="comix-field-label">LINKS</label>
                      <div className="comix-field-input-box">
                        <textarea
                          maxLength={500}
                          value={profileSocials}
                          onChange={(e) => setProfileSocials(e.target.value)}
                          placeholder={"https://twitter.com/yourhandle\nhttps://bsky.app/profile/you.bsky.social\nhttps://your-site.com"}
                        />
                      </div>
                      <div className="comix-field-footer">
                        <span>{profileSocials.length} / 500</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ROW 5: EMAIL */}
                <div className="comix-edit-profile-row">
                  <div className="comix-edit-profile-meta">
                    <h3>Email</h3>
                    <p>Used for sign-in and notifications.</p>
                  </div>
                  <div className="comix-edit-profile-fields">
                    <div className="comix-field-wrap">
                      <label className="comix-field-label">EMAIL ADDRESS</label>
                      <div className="comix-field-input-box">
                        <Mail size={16} className="comix-field-input-icon" />
                        <input
                          type="email"
                          className="comix-input-with-icon"
                          value={profileEmail}
                          readOnly
                          style={{ opacity: 0.85 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* ROW 6: PASSWORD */}
                <div className="comix-edit-profile-row">
                  <div className="comix-edit-profile-meta">
                    <h3>Password</h3>
                    <p>Leave blank to keep your current password. Minimum 6 characters.</p>
                  </div>
                  <div className="comix-edit-profile-fields">
                    <div className="comix-edit-profile-grid-2">
                      <div className="comix-field-wrap">
                        <label className="comix-field-label">NEW PASSWORD</label>
                        <div className="comix-field-input-box">
                          <Lock size={15} className="comix-field-input-icon" />
                          <input
                            type="password"
                            className="comix-input-with-icon"
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            autoComplete="new-password"
                          />
                        </div>
                      </div>

                      <div className="comix-field-wrap">
                        <label className="comix-field-label">CONFIRM NEW PASSWORD</label>
                        <div className="comix-field-input-box">
                          <Lock size={15} className="comix-field-input-icon" />
                          <input
                            type="password"
                            className="comix-input-with-icon"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            autoComplete="new-password"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ACTIONS */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingTop: 24, borderTop: '1px solid var(--cx-border)' }}>
                  <button type="submit" className="comix-save-profile-btn" disabled={savingProfile}>
                    {savingProfile ? 'Saving changes...' : 'Save changes'}
                  </button>
                </div>
              </form>
            )}

            {/* 5. PLACEHOLDER FOR OTHER TABS */}
            {activeTab !== 'uploads' &&
              activeTab !== 'hero-slides' &&
              activeTab !== 'featured-series' &&
              activeTab !== 'settings' &&
              activeTab !== 'import-export' &&
              activeTab !== 'edit-profile' &&
              activeTab !== 'donation-supporters' && (
                <div className="comix-placeholder-card">
                  <div className="comix-placeholder-icon">
                    <FolderKanban size={26} />
                  </div>
                  <h3>{activeTab.replace('-', ' ').toUpperCase()}</h3>
                  <p>You can manage this section directly from the dashboard.</p>
                </div>
              )}
          </main>
        </div>
      </div>
      <AdminGuideModal userId={session.user.id} catalogItems={catalogItems} />
    </div>
  );
}