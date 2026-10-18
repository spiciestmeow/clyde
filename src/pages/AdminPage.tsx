import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Bookmark,
  Check,
  Clock,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  LayoutTemplate,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Radio,
  RefreshCw,
  Rss,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Upload,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import SeriesCatalogManager from '../components/SeriesCatalogManager';
import HeroSlidesManager from '../components/HeroSlidesManager';
import {
  DEFAULT_SITE_SETTINGS,
  getSiteSettings,
  saveSiteSettings,
  type HeaderVisibility,
  type HomepageVisibility,
  type SeriesPageVisibility,
  type SiteSettings,
} from '../lib/siteSettings';
import { supabase, supabaseConfigReady } from '../lib/supabase';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { importOriginalCatalog } from '../lib/seriesCatalog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import './admin-comix.css';

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
  | 'import-export'
  | 'blocked-users'
  | 'settings';

const homepageVisibilityOptions: { key: keyof HomepageVisibility; label: string; description: string; group: string }[] = [
  { key: 'featuredSeries', label: 'Featured series', description: 'Featured-series carousel at the top of the homepage.', group: 'Featured content' },
  { key: 'socialPromos', label: 'Social promotions', description: 'Share prompt and Discord invitation cards.', group: 'Promotions' },
  { key: 'issueBanner', label: 'Issue report banner', description: 'Help and issue-report callout below the homepage banner.', group: 'Promotions' },
  { key: 'popularToday', label: 'Popular Today', description: 'Popular-series cover carousel.', group: 'Discovery' },
  { key: 'continueReading', label: 'Continue Reading', description: 'Continue-reading cards and bookmarks shortcut.', group: 'Discovery' },
  { key: 'latestReleases', label: 'Latest Releases', description: 'Recent series and chapter updates.', group: 'Discovery' },
  { key: 'collections', label: 'Collections', description: 'Curated series collections.', group: 'Discovery' },
  { key: 'mostPopular', label: 'Most Popular', description: 'Ranked popular series list.', group: 'Discovery' },
  { key: 'communityActivity', label: 'Community activity', description: 'Latest comments and top members panels.', group: 'Community' },
  { key: 'footer', label: 'Site footer', description: 'Brand information and policy links at the bottom of the page.', group: 'Site information' },
];

const headerVisibilityOptions: { key: keyof HeaderVisibility; label: string; description: string; group: string }[] = [
  { key: 'home', label: 'Home', description: 'Primary route back to the Vortex Scans homepage.', group: 'Navigation' },
  { key: 'series', label: 'Series', description: 'Browse the full catalogue of manga and comics.', group: 'Navigation' },
  { key: 'shop', label: 'Shop', description: 'Link to the Vortex Scans shop.', group: 'Navigation' },
  { key: 'community', label: 'Community', description: 'Community hub and discussion entry point.', group: 'Navigation' },
  { key: 'search', label: 'Search', description: 'Quick search field in the site header.', group: 'Reader tools' },
  { key: 'bookmarks', label: 'Bookmarks', description: 'A reader’s saved series and reading list.', group: 'Reader tools' },
  { key: 'notifications', label: 'Notifications', description: 'Updates and activity notifications.', group: 'Reader tools' },
  { key: 'theme', label: 'Theme control', description: 'Light and dark appearance control.', group: 'Reader tools' },
  { key: 'account', label: 'Account', description: 'Sign in and account access.', group: 'Reader tools' },
  { key: 'discord', label: 'Discord', description: 'Direct link to the Vortex Scans Discord.', group: 'Community' },
];

const seriesPageVisibilityOptions: { key: keyof SeriesPageVisibility; label: string; description: string; group: string }[] = [
  { key: 'seriesFacts', label: 'Series facts', description: 'Status, type, creator credits, chapter count, and update date.', group: 'Series overview' },
  { key: 'ratingStats', label: 'Ratings and favorites', description: 'Rating and favorites totals beside the series cover.', group: 'Series overview' },
  { key: 'reportIssue', label: 'Issue report card', description: 'Report issue callout beside the series cover.', group: 'Series overview' },
  { key: 'sources', label: 'Sources', description: 'Reader links and available translation sources.', group: 'Information tabs' },
  { key: 'synopsis', label: 'Synopsis', description: 'Series summary and genres.', group: 'Information tabs' },
  { key: 'reviews', label: 'Reviews', description: 'Reviews tab and its content.', group: 'Information tabs' },
  { key: 'shareCard', label: 'Share card', description: 'Share this series with other readers.', group: 'Community and discovery' },
  { key: 'discordCard', label: 'Discord card', description: 'Invite readers to the Vortex Scans Discord.', group: 'Community and discovery' },
  { key: 'reactions', label: 'Reactions', description: 'Like, Love, Laugh, Wow, Sad, and Angry reactions.', group: 'Community and discovery' },
  { key: 'discussion', label: 'Discussion', description: 'Series discussion prompt and comments area.', group: 'Community and discovery' },
  { key: 'similarSeries', label: 'Similar series', description: 'Recommended series list beside the page content.', group: 'Community and discovery' },
  { key: 'footer', label: 'Series page footer', description: 'Brand information and policy links below the series page.', group: 'Community and discovery' },
];

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

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
      <div className={`comix-admin-wrapper theme-${theme} comix-login-screen`}>
        <LoaderCircle className="spin-icon" size={32} style={{ color: 'var(--cx-teal)' }} />
      </div>
    );
  }

  if (!supabaseConfigReady) {
    return (
      <div className={`comix-admin-wrapper theme-${theme} comix-login-screen`}>
        <div className="comix-login-card">
          <div className="comix-login-header">
            <div className="comix-logo" style={{ justifyContent: 'center', marginBottom: 12 }}>
              <span className="comix-logo-badge">X</span>
              <span>COMIX ADMIN</span>
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
}: {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onSignedIn: (session: Session) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setFormError('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error || !data.session) {
      setFormError('Sign in failed. Check your admin email and password.');
      setBusy(false);
      return;
    }

    onSignedIn(data.session);
    setBusy(false);
  };

  return (
    <div className={`comix-admin-wrapper theme-${theme} comix-login-screen`}>
      <div className="comix-login-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="comix-logo">
            <span className="comix-logo-badge">X</span>
            <span>COMIX</span>
          </div>
          <button type="button" className="comix-icon-btn" onClick={onToggleTheme} title="Toggle theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>

        <div className="comix-login-header">
          <h1>Admin sign in</h1>
          <p>Manage titles, chapters, and site settings.</p>
        </div>

        {formError && <div className="comix-login-error" role="alert">{formError}</div>}

        <form onSubmit={submit}>
          <div className="comix-login-field">
            <label htmlFor="login-email">Admin email</label>
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
            <input
              id="login-password"
              type="password"
              className="comix-login-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-teal comix-login-btn" disabled={busy || !email || !password}>
            {busy ? <LoaderCircle className="spin-icon" size={16} /> : <ShieldCheck size={16} />}
            {busy ? 'Signing in...' : 'Sign in to Admin'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/" style={{ color: 'var(--cx-text-muted)', fontSize: 13, textDecoration: 'none' }}>
            ← Back to website
          </a>
        </div>
      </div>
    </div>
  );
}

// ====================================================
// COMIX DASHBOARD (MATCHING IMAGE b295b4a2.png)
// ====================================================
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
  const [activeTab, setActiveTab] = useState<SidebarTab>('uploads');
  const [settingsSubTab, setSettingsSubTab] = useState<'homepage' | 'header' | 'series'>('homepage');
  const [topSearch, setTopSearch] = useState('');

  // Series catalog stats
  const catalogQuery = useSeriesCatalog();
  const catalogItems = catalogQuery.items;
  const totalChapters = useMemo(() => {
    return catalogItems.reduce((acc, s) => acc + (s.chapters?.length || 0), 0);
  }, [catalogItems]);

  // Site settings state
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveMessage, setSaveMessage] = useState('Saved');

  // Import catalog mutation
  const queryClient = useQueryClient();
  const importCatalogMutation = useMutation({
    mutationFn: importOriginalCatalog,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });

  useEffect(() => {
    let active = true;
    void getSiteSettings().then((s) => {
      if (active) setSettings(s);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleToggle = async (
    category: 'homepage' | 'header' | 'seriesPage',
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

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    onLogout();
  };

  // User display name from email or metadata
  const userInitial = (session.user.email?.[0] || 'S').toUpperCase();
  const displayName = session.user.user_metadata?.full_name || 'Spain Crew';

  return (
    <div className={`comix-admin-wrapper theme-${theme}`}>
      {/* Top Navbar */}
      <header className="comix-topbar">
        <div className="comix-topbar-left">
          <a href="/" className="comix-logo" title="Back to home">
            <span className="comix-logo-badge">X</span>
            <span>COMIX</span>
          </a>

          <div className="comix-search-wrap">
            <Search className="comix-search-icon" size={15} />
            <input
              type="text"
              className="comix-search-input"
              placeholder="Search any title..."
              value={topSearch}
              onChange={(e) => setTopSearch(e.target.value)}
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
          <a href="/" className="comix-icon-btn" title="View public website">
            <ArrowLeft size={18} />
          </a>
          <button type="button" className="comix-icon-btn" onClick={() => setActiveTab('settings')} title="Settings">
            <Settings size={18} />
          </button>
          <button type="button" className="comix-icon-btn" onClick={() => setActiveTab('notifications')} title="Notifications">
            <Bell size={18} />
          </button>
          <div className="comix-user-circle" title={session.user.email || 'Admin user'}>
            {userInitial}
          </div>
        </div>
      </header>

      <div className="comix-container">
        {/* Profile Banner Card */}
        <div className="comix-profile-card">
          <div className="comix-profile-user">
            <div className="comix-profile-avatar">{userInitial}</div>
            <div className="comix-profile-details">
              <h2>{displayName}</h2>
              <span className="comix-profile-role">Admin / Scanlator</span>
            </div>
          </div>

          <div className="comix-stats-row">
            <div className="comix-stat-col">
              <span className="comix-stat-number">{catalogItems.length}</span>
              <span className="comix-stat-label">Titles</span>
            </div>
            <div className="comix-stat-col">
              <span className="comix-stat-number">1</span>
              <span className="comix-stat-label">Groups</span>
            </div>
            <div className="comix-stat-col">
              <span className="comix-stat-number">{totalChapters}</span>
              <span className="comix-stat-label">Chapters</span>
            </div>
            <div className="comix-stat-col">
              <span className="comix-stat-number">0</span>
              <span className="comix-stat-label">Comments</span>
            </div>
            <div className="comix-stat-col">
              <span className="comix-stat-number">5</span>
              <span className="comix-stat-label">Collections</span>
            </div>
            <div className="comix-stat-col">
              <span className="comix-stat-number">0</span>
              <span className="comix-stat-label">Likes</span>
            </div>
          </div>
        </div>

        {/* Dashboard 2-Column Grid */}
        <div className="comix-layout-grid">
          {/* Left Sidebar */}
          <aside className="comix-sidebar">
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'edit-profile' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('edit-profile')}
            >
              <UserCheck size={16} className="nav-icon" />
              <span>Edit Profile</span>
            </button>
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'followed-titles' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('followed-titles')}
            >
              <Bookmark size={16} className="nav-icon" />
              <span>Followed Titles</span>
            </button>
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'followed-users' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('followed-users')}
            >
              <Users size={16} className="nav-icon" />
              <span>Followed Users</span>
            </button>
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'followed-groups' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('followed-groups')}
            >
              <Users size={16} className="nav-icon" />
              <span>Followed Groups</span>
            </button>
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'read-history' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('read-history')}
            >
              <History size={16} className="nav-icon" />
              <span>Read History</span>
            </button>
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'collections' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('collections')}
            >
              <FolderKanban size={16} className="nav-icon" />
              <span>Collections</span>
            </button>
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'feed' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('feed')}
            >
              <Rss size={16} className="nav-icon" />
              <span>Feed</span>
            </button>
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'notifications' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('notifications')}
            >
              <Bell size={16} className="nav-icon" />
              <span>Notifications</span>
            </button>
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'comments' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              <MessageSquare size={16} className="nav-icon" />
              <span>Comments</span>
            </button>
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'posts' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('posts')}
            >
              <FileText size={16} className="nav-icon" />
              <span>Posts</span>
            </button>

            {/* Active primary tab: Uploaded Chapters / Uploads */}
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'uploads' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('uploads')}
            >
              <Upload size={16} className="nav-icon" />
              <span>Uploaded Chapters</span>
              <span className="nav-badge">{catalogItems.length}</span>
            </button>

            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'hero-slides' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('hero-slides')}
            >
              <LayoutTemplate size={16} className="nav-icon" />
              <span>Hero Slides</span>
            </button>

            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'import-export' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('import-export')}
            >
              <Database size={16} className="nav-icon" />
              <span>Import / Export</span>
            </button>
            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'blocked-users' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('blocked-users')}
            >
              <UserX size={16} className="nav-icon" />
              <span>Blocked Users</span>
            </button>

            <div className="comix-sidebar-divider" />

            <button
              type="button"
              className={`comix-nav-item ${activeTab === 'settings' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={16} className="nav-icon" />
              <span>Settings</span>
            </button>
            <button
              type="button"
              className="comix-nav-item"
              onClick={handleSignOut}
              style={{ color: 'var(--cx-text-subtle)' }}
            >
              <LogOut size={16} className="nav-icon" />
              <span>Sign out</span>
            </button>
          </aside>

          {/* Right Main Content */}
          <main className="comix-main-panel">
            {/* 1. UPLOADS / SERIES CATALOG (Default) */}
            {activeTab === 'uploads' && <SeriesCatalogManager />}

            {/* 2. HERO SLIDES MANAGER */}
            {activeTab === 'hero-slides' && (
              <HeroSlidesManager settings={settings} onSave={(updated) => setSettings(updated)} />
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
                  <div className="comix-setting-item" style={{ border: '1px solid var(--cx-border)', borderRadius: 8, padding: 16 }}>
                    <div>
                      <strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>Restore missing baseline series</strong>
                      <span style={{ fontSize: 13, color: 'var(--cx-text-muted)' }}>
                        Fills in default titles if your database was freshly reset.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-dark"
                      onClick={() => importCatalogMutation.mutate()}
                      disabled={importCatalogMutation.isPending}
                    >
                      {importCatalogMutation.isPending ? <LoaderCircle className="spin-icon" size={15} /> : <RefreshCw size={15} />}
                      {importCatalogMutation.isPending ? 'Importing...' : 'Restore catalog'}
                    </button>
                  </div>

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
                      <Download size={15} /> Export JSON
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. EDIT PROFILE */}
            {activeTab === 'edit-profile' && (
              <div className="comix-settings-card" style={{ padding: 24 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Admin Profile</h3>
                <p style={{ color: 'var(--cx-text-muted)', marginBottom: 24, fontSize: 14 }}>
                  Connected through Supabase authentication.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="field-group">
                    <label className="field-label">Email address</label>
                    <input
                      type="text"
                      className="text-input"
                      value={session.user.email || ''}
                      readOnly
                      style={{ opacity: 0.8 }}
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">User ID</label>
                    <input
                      type="text"
                      className="text-input"
                      value={session.user.id}
                      readOnly
                      style={{ opacity: 0.8, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>

                  <div style={{ paddingTop: 12 }}>
                    <button type="button" className="btn-cancel" onClick={handleSignOut}>
                      <LogOut size={15} style={{ marginRight: 6 }} /> Sign out
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 5. PLACEHOLDER FOR OTHER TABS */}
            {activeTab !== 'uploads' &&
              activeTab !== 'hero-slides' &&
              activeTab !== 'settings' &&
              activeTab !== 'import-export' &&
              activeTab !== 'edit-profile' && (
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
    </div>
  );
}
