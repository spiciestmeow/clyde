import { useState } from 'react';
import {
  Check,
  ExternalLink,
  PlusSquare,
  Share,
  Sparkles,
  X,
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
  const currentMode: 'standalone' | 'fullscreen' =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'fullscreen'
      ? 'fullscreen'
      : 'standalone';
  const [installedSuccess, setInstalledSuccess] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  const handleInstallClick = async (mode: 'standalone' | 'fullscreen') => {
    const result = await triggerInstall(mode);
    if (result.success) {
      setInstalledSuccess(true);
    } else if (result.method === 'manual') {
      setShowManualModal(true);
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
            <img
              src="/pwa-mockup.png"
              alt="Clydee PWA on mobile device"
              className="install-pwa-mockup-img"
              width={540}
              height={310}
              loading="eager"
            />
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
                <span className="install-pwa-action-card-desc">Include other UI elements such as a status bar.{currentMode !== 'standalone' ? ' (page will reload to switch mode)' : ''}</span>
              </div>
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
                <span className="install-pwa-action-card-desc">All of the available display area is used.{currentMode !== 'fullscreen' ? ' (page will reload to switch mode)' : ''}</span>
              </div>
            </button>
          </div>

          <div className="install-pwa-tip-box">
            <strong>Android Tip:</strong> If your browser hasn't prompted yet, tap the browser menu (<strong>⋮</strong>) in the top-right and choose <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
          </div>
        </section>

        {/* iOS Section */}
        <section className="install-pwa-section" aria-labelledby="section-ios">
          <div className="install-pwa-section-header">
            <h2 id="section-ios" className="install-pwa-section-title">iOS / iPadOS</h2>
            <p className="install-pwa-section-sub">Safari and most other iOS browsers.</p>
          </div>

          <ol className="install-pwa-steps-list">
            <li className="install-pwa-step-card">
              <span className="install-pwa-step-num">1</span>
              <div className="install-pwa-step-content">
                <strong>Open in Safari</strong>
                <span>Open Clydee in Safari on your iPhone or iPad.</span>
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
      </main>

      {/* Manual Fallback Modal if browser didn't supply direct beforeinstallprompt */}
      {showManualModal && (
        <div className="install-pwa-modal-backdrop" onClick={() => setShowManualModal(false)}>
          <div className="install-pwa-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="install-pwa-modal-header">
              <div className="install-pwa-modal-icon">
                <img src="/pwa-192x192.png" alt="Clydee" width={48} height={48} />
              </div>
              <div className="install-pwa-modal-title-group">
                <h3>Install Clydee App</h3>
                <p>clydee</p>
              </div>
              <button
                type="button"
                className="install-pwa-modal-close"
                onClick={() => setShowManualModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="install-pwa-modal-body">
              {platform === 'ios' ? (
                <div className="install-pwa-modal-instructions">
                  <p>To install on <strong>iOS (Safari)</strong>:</p>
                  <ol>
                    <li>Tap the <strong>Share</strong> button (box with arrow) at the bottom of Safari.</li>
                    <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                    <li>Tap <strong>Add</strong> in the top-right.</li>
                  </ol>
                </div>
              ) : (
                <div className="install-pwa-modal-instructions">
                  <p>Your browser requires 1 quick manual tap to complete installation:</p>
                  <ol>
                    <li>Click or tap the <strong>Menu (⋮)</strong> in your browser bar (or the <strong>install icon</strong> on the right of the URL bar).</li>
                    <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                    <li>Confirm by clicking <strong>Install</strong>.</li>
                  </ol>
                </div>
              )}
            </div>

            <div className="install-pwa-modal-footer">
              <button
                type="button"
                className="install-pwa-modal-btn"
                onClick={() => setShowManualModal(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <SiteFooter
        className="footer install-pwa-footer"
        logoSrc="/clydee-logo.png"
        tagline="Read Comics, manga, manhua, manhwa, translated swiftly: Clydee, your ultimate library."
      />
    </div>
  );
}
