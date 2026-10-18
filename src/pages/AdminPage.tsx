import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, BookOpen, Check, Eye, EyeOff, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Menu, Rows3, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import SeriesCatalogManager from '../components/SeriesCatalogManager';
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

const visibilityOptions: { key: keyof HeaderVisibility; label: string; description: string; group: string }[] = [
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

function VisibilityRow({
  label,
  description,
  enabled,
  onToggle,
  testId,
  disabled,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  testId: string;
  disabled: boolean;
}) {
  return (
    <div className={`admin-setting-row ${enabled ? '' : 'is-hidden'}`}>
      <div className="admin-setting-symbol" aria-hidden="true">{enabled ? <Eye size={17} /> : <EyeOff size={17} />}</div>
      <div className="admin-setting-copy"><strong>{label}</strong><span>{description}</span></div>
      <span className={`admin-state-label ${enabled ? 'is-on' : ''}`}>{enabled ? 'Visible' : 'Hidden'}</span>
      <button
        type="button"
        className={`admin-switch ${enabled ? 'is-on' : ''}`}
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? 'Hide' : 'Show'} ${label}`}
        onClick={onToggle}
        disabled={disabled}
        data-testid={testId}
      ><span /></button>
    </div>
  );
}

function SupabaseSetupNotice() {
  return (
    <main className="admin-auth-main">
      <section className="admin-auth-card">
        <div className="admin-auth-mark"><LockKeyhole size={22} /></div>
        <span className="admin-eyebrow">VORTEX SCANS / CONTROL ROOM</span>
        <h1>Connect Supabase</h1>
        <p className="admin-auth-copy">
          Add your project URL and public anon key to <code>.env.local</code>, then restart Vite.
          Never put a Supabase service-role key in this file.
        </p>
        <a className="admin-back-link" href="/"><ArrowLeft size={15} /> Back to Vortex Scans</a>
      </section>
      <div className="admin-auth-footer"><span className="admin-status-dot" /> Supabase setup required</div>
    </main>
  );
}

function AdminSignIn({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

    setPassword('');
    onSignedIn(data.session);
    setBusy(false);
  };

  return (
    <main className="admin-auth-main">
      <section className="admin-auth-card">
        <div className="admin-auth-mark"><LockKeyhole size={22} /></div>
        <span className="admin-eyebrow">VORTEX SCANS / CONTROL ROOM</span>
        <h1>Admin sign in</h1>
        <p className="admin-auth-copy">Sign in with the admin account created in Supabase.</p>
        <form onSubmit={submit} className="admin-login-form">
          <label htmlFor="admin-email">Admin email</label>
          <div className="admin-password-wrap">
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <label htmlFor="admin-password">Password</label>
          <div className="admin-password-wrap">
            <input
              id="admin-password"
              data-testid="input-admin-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              maxLength={1024}
            />
            <button type="button" className="admin-password-reveal" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'} data-testid="button-toggle-password">
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {formError && <p className="admin-form-error" role="alert" data-testid="status-login-error">{formError}</p>}
          <button className="admin-primary-button admin-login-submit" type="submit" disabled={!email || !password || busy} data-testid="button-admin-sign-in">
            {busy ? <><LoaderCircle className="admin-spin" size={16} /> Signing in</> : <><ShieldCheck size={16} /> Sign in securely</>}
          </button>
        </form>
        <a className="admin-back-link" href="/"><ArrowLeft size={15} /> Back to Vortex Scans</a>
      </section>
      <div className="admin-auth-footer"><span className="admin-status-dot" /> Supabase-secured admin access</div>
    </main>
  );
}

function SettingsConsole({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [activePanel, setActivePanel] = useState<'homepage' | 'header' | 'series' | 'catalog'>('homepage');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [saveMessage, setSaveMessage] = useState('Synced');
  const homepageEnabledCount = settings ? Object.values(settings.homepage).filter(Boolean).length : 0;
  const headerEnabledCount = settings ? Object.values(settings.header).filter(Boolean).length : 0;
  const seriesPageEnabledCount = settings ? Object.values(settings.seriesPage).filter(Boolean).length : 0;
  const enabledCount = activePanel === 'homepage'
    ? homepageEnabledCount
    : activePanel === 'header' ? headerEnabledCount : seriesPageEnabledCount;
  const itemCount = activePanel === 'homepage'
    ? Object.keys(DEFAULT_SITE_SETTINGS.homepage).length
      : activePanel === 'header'
      ? Object.keys(DEFAULT_SITE_SETTINGS.header).length
      : Object.keys(DEFAULT_SITE_SETTINGS.seriesPage).length;
  const itemLabel = activePanel === 'homepage' ? 'SECTIONS' : activePanel === 'series' ? 'FEATURES' : 'ITEMS';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSettingsError('');

    void getSiteSettings()
      .then((savedSettings) => {
        if (active) setSettings(savedSettings);
      })
      .catch(() => {
        if (active) setSettingsError('Could not load settings. Confirm the Supabase SQL setup has been run.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const persistSettings = async (previous: SiteSettings, next: SiteSettings) => {
    if (saving) return;
    setSettings(next);
    setSaving(true);
    setSaveMessage('Saving');
    setSettingsError('');

    try {
      const saved = await saveSiteSettings(next);
      setSettings(saved);
      setSaveMessage('Saved');
    } catch {
      setSettings(previous);
      setSaveMessage('Not saved');
      setSettingsError('Could not save this change. Check the admin email in your Supabase SQL policy.');
    } finally {
      setSaving(false);
    }
  };

  const toggleHeaderVisibility = (key: keyof HeaderVisibility) => {
    if (!settings || saving) return;
    const previous = settings;
    const next: SiteSettings = {
      ...settings,
      header: { ...settings.header, [key]: !settings.header[key] },
    };
    void persistSettings(previous, next);
  };

  const toggleHomepageVisibility = (key: keyof HomepageVisibility) => {
    if (!settings || saving) return;
    const previous = settings;
    const next: SiteSettings = {
      ...settings,
      homepage: { ...settings.homepage, [key]: !settings.homepage[key] },
    };
    void persistSettings(previous, next);
  };

  const toggleSeriesPageVisibility = (key: keyof SeriesPageVisibility) => {
    if (!settings || saving) return;
    const previous = settings;
    const next: SiteSettings = {
      ...settings,
      seriesPage: { ...settings.seriesPage, [key]: !settings.seriesPage[key] },
    };
    void persistSettings(previous, next);
  };

  const leave = async () => {
    if (!supabase) return;
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    setSigningOut(false);
    if (!error) onLogout();
  };

  return (
    <div className="admin-console">
      <header className="admin-topbar">
        <a href="/" className="admin-brand" aria-label="Vortex Scans home">
          <span className="admin-brand-symbol">V</span>
          <span>VORTEX<span className="admin-brand-light">SCANS</span><small>CONTROL ROOM</small></span>
        </a>
        <div className="admin-topbar-right">
          <span className="admin-session-label"><i /> Admin session active</span>
          <button className="admin-logout-button" onClick={() => void leave()} disabled={signingOut} data-testid="button-admin-logout">
            <LogOut size={15} /> {signingOut ? 'Signing out' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="admin-content">
        <div className="admin-breadcrumb"><span>VORTEX SCANS</span><b>/</b><span>ADMIN</span></div>
        <section className="admin-intro">
          <div>
            <div className="admin-eyebrow"><span className="admin-live-dot" /> SITE CONFIGURATION</div>
            <h1>{activePanel === 'catalog' ? 'Series catalog' : 'Site controls'}</h1>
            <p>{activePanel === 'catalog'
              ? 'Add complete series entries to the catalog. Saved titles appear for every visitor.'
              : 'Manage homepage content, public navigation, and series page features. Saved changes are shared with every visitor.'}</p>
          </div>
          {activePanel !== 'catalog' && <div className="admin-intro-stat"><span>{settings ? String(enabledCount).padStart(2, '0') : '—'}</span><small>OF {itemCount} {itemLabel}<br />VISIBLE</small></div>}
        </section>

        {loading && (
          <section className="admin-settings-card" aria-label="Loading settings">
            <div className="admin-loading-line"><span /><span /><span /></div>
            <div className="admin-skeleton-row" /><div className="admin-skeleton-row" /><div className="admin-skeleton-row" />
          </section>
        )}
        {settingsError && (
          <section className="admin-error-panel" role="alert">
            <div><strong>Settings need attention</strong><p>{settingsError}</p></div>
          </section>
        )}
        {!loading && settings && (
          <div className="admin-workspace">
            <nav className="admin-view-tabs" aria-label="Site settings">
              <div className="admin-view-tabs-label">Control room</div>
              <button
                type="button"
                className={`admin-view-tab ${activePanel === 'homepage' ? 'is-active' : ''}`}
                aria-current={activePanel === 'homepage' ? 'page' : undefined}
                onClick={() => setActivePanel('homepage')}
                data-testid="tab-homepage-settings"
              >
                <span className="admin-view-tab-icon"><LayoutDashboard size={17} /></span>
                <span className="admin-view-tab-copy"><strong>Homepage sections</strong><small>Control visible page content</small></span>
                <span className="admin-view-tab-count">{homepageEnabledCount}/{Object.keys(DEFAULT_SITE_SETTINGS.homepage).length}</span>
              </button>
              <button
                type="button"
                className={`admin-view-tab ${activePanel === 'header' ? 'is-active' : ''}`}
                aria-current={activePanel === 'header' ? 'page' : undefined}
                onClick={() => setActivePanel('header')}
                data-testid="tab-header-settings"
              >
                <span className="admin-view-tab-icon"><Menu size={17} /></span>
                <span className="admin-view-tab-copy"><strong>Header items</strong><small>Control navigation and tools</small></span>
                <span className="admin-view-tab-count">{headerEnabledCount}/{Object.keys(DEFAULT_SITE_SETTINGS.header).length}</span>
              </button>
              <button
                type="button"
                className={`admin-view-tab ${activePanel === 'series' ? 'is-active' : ''}`}
                aria-current={activePanel === 'series' ? 'page' : undefined}
                onClick={() => setActivePanel('series')}
                data-testid="tab-series-page-settings"
              >
                <span className="admin-view-tab-icon"><Rows3 size={17} /></span>
                <span className="admin-view-tab-copy"><strong>Series page</strong><small>Control detail-page features</small></span>
                <span className="admin-view-tab-count">{seriesPageEnabledCount}/{Object.keys(DEFAULT_SITE_SETTINGS.seriesPage).length}</span>
              </button>
              <button
                type="button"
                className={`admin-view-tab ${activePanel === 'catalog' ? 'is-active' : ''}`}
                aria-current={activePanel === 'catalog' ? 'page' : undefined}
                onClick={() => setActivePanel('catalog')}
                data-testid="tab-series-catalog"
              >
                <span className="admin-view-tab-icon"><BookOpen size={17} /></span>
                <span className="admin-view-tab-copy"><strong>Series catalog</strong><small>Add and manage public titles</small></span>
                <span className="admin-view-tab-count">LIVE</span>
              </button>
            </nav>
            <div className="admin-workspace-main">
              {activePanel === 'catalog' ? <SeriesCatalogManager /> : <section className="admin-settings-card">
                <div className="admin-card-heading">
                  <div className="admin-card-heading-icon"><SlidersHorizontal size={18} /></div>
                  <div>
                    <h2>{activePanel === 'homepage' ? 'Homepage sections' : activePanel === 'header' ? 'Public header items' : 'Series page features'}</h2>
                    <p>{activePanel === 'homepage'
                      ? 'Hide sections from the homepage for all visitors.'
                      : activePanel === 'header'
                        ? 'Hidden items are removed from the navigation, not just disabled.'
                        : 'Hide features from every series detail page for all visitors.'}</p>
                  </div>
                  <div className={`admin-save-indicator ${saving ? 'saving' : ''}`} data-testid="status-settings-save">
                    {saving ? <><LoaderCircle className="admin-spin" size={14} /> Saving</> : <><Check size={14} /> {saveMessage}</>}
                  </div>
                </div>
                {activePanel === 'homepage'
                  ? ['Featured content', 'Promotions', 'Discovery', 'Community', 'Site information'].map((group) => (
                    <div className="admin-setting-group" key={group}>
                      <div className="admin-group-label"><span>{group}</span><i /></div>
                      {homepageVisibilityOptions.filter((option) => option.group === group).map((option) => (
                        <VisibilityRow
                          key={option.key}
                          label={option.label}
                          description={option.description}
                          enabled={settings.homepage[option.key]}
                          onToggle={() => toggleHomepageVisibility(option.key)}
                          testId={`switch-homepage-${option.key}`}
                          disabled={saving}
                        />
                      ))}
                    </div>
                  ))
                  : activePanel === 'header'
                    ? ['Navigation', 'Reader tools', 'Community'].map((group) => (
                    <div className="admin-setting-group" key={group}>
                      <div className="admin-group-label"><span>{group}</span><i /></div>
                      {visibilityOptions.filter((option) => option.group === group).map((option) => (
                        <VisibilityRow
                          key={option.key}
                          label={option.label}
                          description={option.description}
                          enabled={settings.header[option.key]}
                          onToggle={() => toggleHeaderVisibility(option.key)}
                          testId={`switch-header-${option.key}`}
                          disabled={saving}
                        />
                      ))}
                    </div>
                  ))
                    : ['Series overview', 'Information tabs', 'Community and discovery'].map((group) => (
                      <div className="admin-setting-group" key={group}>
                        <div className="admin-group-label"><span>{group}</span><i /></div>
                        {seriesPageVisibilityOptions.filter((option) => option.group === group).map((option) => (
                          <VisibilityRow
                            key={option.key}
                            label={option.label}
                            description={option.description}
                            enabled={settings.seriesPage[option.key]}
                            onToggle={() => toggleSeriesPageVisibility(option.key)}
                            testId={`switch-series-${option.key}`}
                            disabled={saving}
                          />
                        ))}
                      </div>
                    ))}
              </section>}
              {activePanel !== 'catalog' && <div className="admin-note"><ShieldCheck size={16} /><span>These settings are shared across all visitors and devices.</span><span className="admin-note-code">SITE SETTINGS · GLOBAL</span></div>}
            </div>
          </div>
        )}
      </main>
      <footer className="admin-console-footer"><span>VORTEX SCANS ADMIN</span><span>{session.user.email}</span></footer>
    </div>
  );
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setCheckingSession(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setCheckingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setCheckingSession(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!supabaseConfigReady) {
    return <div className="admin-auth-shell"><SupabaseSetupNotice /></div>;
  }
  if (checkingSession) {
    return <div className="admin-auth-shell"><div className="admin-auth-loading"><div className="admin-loading-mark" /><span>Checking admin session</span></div></div>;
  }
  if (!session) {
    return <div className="admin-auth-shell"><AdminSignIn onSignedIn={setSession} /></div>;
  }
  return <SettingsConsole session={session} onLogout={() => setSession(null)} />;
}
