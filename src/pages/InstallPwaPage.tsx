import { useState } from 'react';
import { Link } from 'wouter';
import {
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Laptop,
  Maximize2,
  PlusSquare,
  Share,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import SiteFooter from '../components/SiteFooter';
import SiteHeader from '../components/SiteHeader';
import SiteSearch from '../components/SiteSearch';
import { toSiteSearchItems, toTrendingSiteSearchItems } from '../data/seriesSearchCatalog';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { useThemeMode } from '../hooks/useThemeMode';
import { usePwaInstall } from '../hooks/usePwaInstall';
import assets from '../../clone-data/asset-references.json';
import './install-pwa-page.css';

type Asset = { src: string; alt: string };
const manifest = assets as Asset[];

export default function InstallPwaPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { dark, toggleTheme } = useThemeMode();
  const catalogQuery = useSeriesCatalog();
  const searchItems = toSiteSearchItems(catalogQuery.items);
  const trendingItems = toTrendingSiteSearchItems(catalogQuery.items);

  const { canInstall, isInstalled, platform, triggerInstall } = usePwaInstall();
  const [installedSuccess, setInstalledSuccess] = useState(false);

  const handleInstallClick = async (mode: 'standalone' | 'fullscreen') => {
    const success = await triggerInstall(mode);
    if (success) {
      setInstalledSuccess(true);
    }
  };

  return (
    <div className={`vortex-page install-pwa-route ${dark ? 'theme-dark' : 'theme-light'}`}>
      <SiteHeader
        activeSection="home"
        logoSrc="/clydee-logo.png"
        discordSrc={manifest[5]?.src ?? ''}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
        dark={dark}
        onToggleTheme={toggleTheme}
        communityHref="/#community"
        search={<SiteSearch items={searchItems} trendingItems={trendingItems} />}
      />

      <main className="install-pwa-container">
        {/* Breadcrumb */}
        <nav className="install-pwa-breadcrumbs" aria-label="Breadcrumb">
          <Link href="/" className="install-pwa-breadcrumb-link">HOME</Link>
          <span className="install-pwa-breadcrumb-sep" aria-hidden="true">/</span>
          <span className="install-pwa-breadcrumb-current">INSTALL PWA</span>
        </nav>

        {/* Page Header */}
        <header className="install-pwa-header">
          <h1 className="install-pwa-title">Progressive Web App</h1>
          <p className="install-pwa-subtitle">
            Install the Clydee PWA on Android, iOS or your desktop for an app-like reading experience.
          </p>
          {isInstalled && (
            <div className="install-pwa-badge-installed" role="status">
              <Check size={16} />
              <span>Clydee is already installed on this device</span>
            </div>
          )}
          {installedSuccess && (
            <div className="install-pwa-badge-installed" role="status">
              <Sparkles size={16} />
              <span>Thank you! Clydee is being installed.</span>
            </div>
          )}
        </header>

        {/* Overview Section */}
        <section className="install-pwa-section" aria-labelledby="section-overview">
          <h2 id="section-overview" className="install-pwa-section-title">Overview</h2>

          {/* Smartphone Mockup */}
          <div className="install-pwa-mockup-wrapper">
            <div className="install-pwa-phone">
              <div className="install-pwa-phone-notch">
                <span className="install-pwa-phone-camera" />
              </div>
              <div className="install-pwa-phone-screen">
                <div className="install-pwa-phone-statusbar">
                  <span className="install-pwa-phone-time">9:41</span>
                  <div className="install-pwa-phone-indicators">
                    <span className="install-pwa-bar-signal" />
                    <span className="install-pwa-bar-wifi" />
                    <span className="install-pwa-bar-battery" />
                  </div>
                </div>

                <div className="install-pwa-phone-grid">
                  {/* Clydee App Icon */}
                  <div className="install-pwa-app-icon is-highlighted">
                    <div className="install-pwa-app-icon-img">
                      <img src="/pwa-192x192.png" alt="Clydee icon" width={60} height={60} />
                    </div>
                    <span className="install-pwa-app-name">Clydee</span>
                  </div>

                  {/* Dummy Home Icons */}
                  <div className="install-pwa-app-icon">
                    <div className="install-pwa-app-icon-dummy dummy-cal">
                      <span className="dummy-cal-day">MON</span>
                      <span className="dummy-cal-num">6</span>
                    </div>
                    <span className="install-pwa-app-name">Calendar</span>
                  </div>

                  <div className="install-pwa-app-icon">
                    <div className="install-pwa-app-icon-dummy dummy-photos" />
                    <span className="install-pwa-app-name">Photos</span>
                  </div>

                  <div className="install-pwa-app-icon">
                    <div className="install-pwa-app-icon-dummy dummy-camera" />
                    <span className="install-pwa-app-name">Camera</span>
                  </div>

                  <div className="install-pwa-app-icon">
                    <div className="install-pwa-app-icon-dummy dummy-mail" />
                    <span className="install-pwa-app-name">Mail</span>
                  </div>

                  <div className="install-pwa-app-icon">
                    <div className="install-pwa-app-icon-dummy dummy-safari" />
                    <span className="install-pwa-app-name">Browser</span>
                  </div>

                  <div className="install-pwa-app-icon">
                    <div className="install-pwa-app-icon-dummy dummy-clock" />
                    <span className="install-pwa-app-name">Clock</span>
                  </div>

                  <div className="install-pwa-app-icon">
                    <div className="install-pwa-app-icon-dummy dummy-settings" />
                    <span className="install-pwa-app-name">Settings</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="install-pwa-prose">
            <p>
              A Progressive Web App (PWA) is a lightweight version of Clydee you can install directly on your device like a normal app. It loads faster, runs smoother, and lets you reach your favorite comics with a single tap.
            </p>
            <p>
              The Clydee PWA works across iPhone, iPad, Android phones and tablets, Windows, macOS, and Linux &mdash; same clean, app-like reader, anywhere.
            </p>
          </div>
        </section>

        {/* Android Section */}
        <section className="install-pwa-section" aria-labelledby="section-android">
          <div className="install-pwa-section-header">
            <h2 id="section-android" className="install-pwa-section-title">Android</h2>
            <p className="install-pwa-section-sub">UI visible or full-screen.</p>
          </div>

          <div className="install-pwa-options">
            <button
              type="button"
              className="install-pwa-action-card"
              onClick={() => void handleInstallClick('standalone')}
            >
              <div className="install-pwa-action-card-text">
                <span className="install-pwa-action-card-title">Install Include UI</span>
                <span className="install-pwa-action-card-desc">Include other UI elements such as a status bar.</span>
              </div>
              <Download size={20} className="install-pwa-action-card-icon" />
            </button>

            <div className="install-pwa-or-divider" aria-hidden="true">
              <span>OR</span>
            </div>

            <button
              type="button"
              className="install-pwa-action-card"
              onClick={() => void handleInstallClick('fullscreen')}
            >
              <div className="install-pwa-action-card-text">
                <span className="install-pwa-action-card-title">Install Fullscreen</span>
                <span className="install-pwa-action-card-desc">All of the available display area is used. (page will reload to switch mode)</span>
              </div>
              <Maximize2 size={20} className="install-pwa-action-card-icon" />
            </button>
          </div>

          <div className="install-pwa-tip-box">
            <strong>Android Tip:</strong> If the button doesn't open the install prompt, tap the Chrome menu (<strong>⋮</strong>) in the top-right and choose <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
          </div>
        </section>

        {/* iOS Section */}
        <section className="install-pwa-section" aria-labelledby="section-ios">
          <div className="install-pwa-section-header">
            <h2 id="section-ios" className="install-pwa-section-title">iOS (iPhone & iPad)</h2>
            <p className="install-pwa-section-sub">Install directly via Safari in 4 quick steps.</p>
          </div>

          <ol className="install-pwa-steps-list">
            <li className="install-pwa-step-card">
              <span className="install-pwa-step-num">1</span>
              <div className="install-pwa-step-content">
                <strong>Open in Safari</strong>
                <span>Open Clydee in the Safari browser on your iPhone or iPad.</span>
              </div>
              <ExternalLink size={18} className="install-pwa-step-icon" />
            </li>

            <li className="install-pwa-step-card">
              <span className="install-pwa-step-num">2</span>
              <div className="install-pwa-step-content">
                <strong>Tap the Share Button</strong>
                <span>Tap the Share icon (square with an arrow pointing up) at the bottom toolbar.</span>
              </div>
              <Share size={18} className="install-pwa-step-icon" />
            </li>

            <li className="install-pwa-step-card">
              <span className="install-pwa-step-num">3</span>
              <div className="install-pwa-step-content">
                <strong>Add to Home Screen</strong>
                <span>Scroll down the action sheet and select <em>"Add to Home Screen"</em>.</span>
              </div>
              <PlusSquare size={18} className="install-pwa-step-icon" />
            </li>

            <li className="install-pwa-step-card">
              <span className="install-pwa-step-num">4</span>
              <div className="install-pwa-step-content">
                <strong>Tap "Add"</strong>
                <span>Tap <strong>Add</strong> in the top-right corner to place Clydee on your home screen.</span>
              </div>
              <Check size={18} className="install-pwa-step-icon" />
            </li>
          </ol>
        </section>

        {/* Desktop Section */}
        <section className="install-pwa-section" aria-labelledby="section-desktop">
          <div className="install-pwa-section-header">
            <h2 id="section-desktop" className="install-pwa-section-title">Desktop (Windows, macOS, Linux)</h2>
            <p className="install-pwa-section-sub">Experience Clydee in a clean, standalone desktop window.</p>
          </div>

          <button
            type="button"
            className="install-pwa-action-card"
            onClick={() => void handleInstallClick('standalone')}
          >
            <div className="install-pwa-action-card-text">
              <span className="install-pwa-action-card-title">Install on Desktop</span>
              <span className="install-pwa-action-card-desc">Install Clydee as an app for Chrome, Edge, Brave, or Opera.</span>
            </div>
            <Laptop size={20} className="install-pwa-action-card-icon" />
          </button>

          <div className="install-pwa-tip-box">
            <strong>Desktop Shortcut:</strong> Look for the <strong>Install icon</strong> in your browser's address bar (on the right side of the URL), or click the browser menu (<strong>⋮</strong>) &rarr; <strong>"Install Clydee"</strong>.
          </div>
        </section>
      </main>

      <SiteFooter
        className="footer install-pwa-footer"
        logoSrc="/clydee-logo.png"
        tagline="Read Comics, manga, manhua, manhwa, translated swiftly: Clydee, your ultimate library."
      />
    </div>
  );
}
