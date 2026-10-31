import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  Menu,
  ShoppingBag,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { Link } from 'wouter';
import HeroSpider from './HeroSpider';
import NotificationPopover from './NotificationPopover';
import {
  DEFAULT_HEADER_VISIBILITY,
  getCachedSiteSettings,
  getSiteSettings,
  type HeaderVisibility,
} from '../lib/siteSettings';
import { supabaseConfigReady } from '../lib/supabase';

type SiteSection = 'home' | 'series';

type SiteHeaderProps = {
  activeSection: SiteSection;
  logoSrc: string;
  discordSrc: string;
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
  dark: boolean;
  onToggleTheme: () => void;
  visibility?: HeaderVisibility;
  visibilityReady?: boolean;
  communityHref?: string;
  search?: ReactNode;
};

function LightModeIcon() {
  return (
    <svg className="light-mode-icon" aria-hidden="true" focusable="false" height="22" role="presentation" viewBox="0 0 24 24" width="22">
      <g fill="currentColor">
        <path d="M19 12a7 7 0 11-7-7 7 7 0 017 7z" />
        <path d="M12 22.96a.969.969 0 01-1-.96v-.08a1 1 0 012 0 1.038 1.038 0 01-1 1.04zm7.14-2.82a1.024 1.024 0 01-.71-.29l-.13-.13a1 1 0 011.41-1.41l.13.13a1 1 0 010 1.41.984.984 0 01-.7.29zm-14.28 0a1.024 1.024 0 01-.71-.29 1 1 0 010-1.41l.13-.13a1 1 0 011.41 1.41l-.13.13a1 1 0 01-.7.29zM22 13h-.08a1 1 0 010-2 1.038 1.038 0 011.04 1 .969.969 0 01-.96 1zM2.08 13H2a1 1 0 010-2 1.038 1.038 0 011.04 1 .969.969 0 01-.96 1zm16.93-7.01a1.024 1.024 0 01-.71-.29 1 1 0 010-1.41l.13-.13a1 1 0 011.41 1.41l-.13.13a.984.984 0 01-.7.29zm-14.02 0a1.024 1.024 0 01-.71-.29l-.13-.14a1 1 0 011.41-1.41l.13.13a1 1 0 010 1.41.97.97 0 01-.7.3zM12 3.04a.969.969 0 01-1-.96V2a1 1 0 012 0 1.038 1.038 0 01-1 1.04z" />
      </g>
    </svg>
  );
}

function DarkModeIcon() {
  return (
    <svg className="theme-mode-icon" aria-hidden="true" focusable="false" height="22" role="presentation" viewBox="0 0 24 24" width="22">
      <path d="M21.53 15.93c-.16-.27-.61-.69-1.73-.49a8.46 8.46 0 01-1.88.13 8.409 8.409 0 01-5.91-2.82 8.068 8.068 0 01-1.44-8.66c.44-1.01.13-1.54-.09-1.76s-.77-.55-1.83-.11a10.318 10.318 0 00-6.32 10.21 10.475 10.475 0 007.04 8.99 10 10 0 002.89.55c.16.01.32.02.48.02a10.5 10.5 0 008.47-4.27c.67-.93.49-1.519.32-1.79z" fill="currentColor" />
    </svg>
  );
}

export default function SiteHeader({
  activeSection,
  logoSrc,
  discordSrc,
  mobileMenuOpen,
  onToggleMobileMenu,
  dark,
  onToggleTheme,
  visibility,
  visibilityReady,
  communityHref = '#community',
  search,
}: SiteHeaderProps) {
  const [savedVisibility, setSavedVisibility] = useState(
    () => getCachedSiteSettings()?.header ?? DEFAULT_HEADER_VISIBILITY,
  );
  const [savedVisibilityReady, setSavedVisibilityReady] = useState(
    () => !supabaseConfigReady || getCachedSiteSettings() !== null,
  );
  const [savedFacebookUrl, setSavedFacebookUrl] = useState(
    () => getCachedSiteSettings()?.facebookUrl || 'https://facebook.com',
  );

  useEffect(() => {
    const hasAuthoritativeVisibility = visibility !== undefined && visibilityReady === true;
    if (hasAuthoritativeVisibility) {
      setSavedVisibility(visibility);
      setSavedVisibilityReady(true);
    }
    if (visibility !== undefined && visibilityReady === false) return;

    let active = true;
    void getSiteSettings()
      .then((settings) => {
        if (active) {
          if (!hasAuthoritativeVisibility) setSavedVisibility(settings.header);
          setSavedFacebookUrl(settings.facebookUrl || 'https://facebook.com');
          setSavedVisibilityReady(true);
        }
      })
      .catch(() => {
        // Keep configurable header items hidden until valid settings are available.
      });

    return () => {
      active = false;
    };
  }, [visibility, visibilityReady]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileMenuOpen]);

  const headerVisibility = visibility ?? savedVisibility ?? DEFAULT_HEADER_VISIBILITY;
  const isSeriesPage = activeSection === 'series';
  const showMenu =
    headerVisibility.home ||
    headerVisibility.series ||
    headerVisibility.shop ||
    headerVisibility.community;

  const closeMenu = () => {
    if (mobileMenuOpen) {
      onToggleMobileMenu();
    }
  };

  const desktopNavigation = (
    <nav className="main-nav desktop-nav">
      {headerVisibility.home && (
        <Link className={`nav-pill${activeSection === 'home' ? ' selected' : ''}`} href="/">
          <svg className="nav-primary-icon" width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.707 2.293l9 9c.63.63.184 1.707-.707 1.707h-1v6a3 3 0 0 1-3 3h-1v-7a3 3 0 0 0-2.824-2.995l-.176-.005h-2a3 3 0 0 0-3 3v7h-1a3 3 0 0 1-3-3v-6h-1c-.89 0-1.337-1.077-.707-1.707l9-9a1 1 0 0 1 1.414 0m.293 11.707a1 1 0 0 1 1 1v7h-4v-7a1 1 0 0 1 .883-.993l.117-.007z" />
          </svg>
          <span>Home</span>
        </Link>
      )}
      {headerVisibility.series && (
        <Link className={`nav-pill${activeSection === 'series' ? ' selected' : ''}`} href="/series">
          <svg className="nav-primary-icon" width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M22 5a1 1 0 0 1-1 1h-8a1 1 0 0 1 0-2h8a1 1 0 0 1 1 1m-3 4a1 1 0 0 1-1 1h-5a1 1 0 0 1 0-2h5a1 1 0 0 1 1 1m3 6a1 1 0 0 1-1 1h-8a1 1 0 0 1 0-2h8a1 1 0 0 1 1 1m-3 4a1 1 0 0 1-1 1h-5a1 1 0 0 1 0-2h5a1 1 0 0 1 1 1m-11-16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2l.001-4.051l.004-.051a1.996 1.996 0 0 1 1.995-1.898zm0 10a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2l.001-4.051l.004-.051a1.996 1.996 0 0 1 1.995-1.898z" />
          </svg>
          <span>Series</span>
        </Link>
      )}
      {headerVisibility.shop && (
        <Link className="nav-pill" href="/shop">
          <ShoppingBag size={15} />
          <span>Shop</span>
        </Link>
      )}
      {headerVisibility.community && (
        <Link className="nav-pill community-pill" href={communityHref}>
          <UsersRound size={15} />
          <span>Community</span>
          <ChevronDown size={12} />
        </Link>
      )}
    </nav>
  );

  const searchContent = headerVisibility.search && search ? search : null;

  return (
    <>
      <header className={`topbar${isSeriesPage ? ' series-topbar' : ''}`}>
        <div className="nav-wrap">
          {/* Logo on the left */}
          <Link href="/" className="brand" onClick={closeMenu} aria-label="Clydee">
            <img src={logoSrc} alt="Clydee logo" />
          </Link>

          {/* Desktop Nav in center */}
          {desktopNavigation}

          {/* Right actions cluster */}
          <div className="topbar-actions">
            {searchContent}

            {headerVisibility.bookmarks && (
              <Link className="bookmark-pill desktop-only" href="/bookmarks">
                <Bookmark size={15} />
                <span>Bookmarks</span>
              </Link>
            )}

            {headerVisibility.facebook && (
              <a
                className="icon-pill facebook-short desktop-only"
                href={savedFacebookUrl}
                aria-label="Facebook"
                title="Join our Facebook"
                target="_blank"
                rel="noreferrer"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
            )}

            {headerVisibility.notifications && (
              <NotificationPopover />
            )}

            {headerVisibility.theme && (
              <button
                className="icon-pill theme-toggle-btn desktop-only"
                aria-label="Toggle theme"
                onClick={onToggleTheme}
                data-testid={isSeriesPage ? 'button-toggle-series-theme' : undefined}
              >
                {dark ? <DarkModeIcon /> : <LightModeIcon />}
              </button>
            )}

            {headerVisibility.account && (
              <Link className="icon-pill" href="/login" aria-label="Account" onClick={closeMenu}>
                <UserRound size={18} />
              </Link>
            )}

            {showMenu && (
              <button
                className="menu-trigger"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                onClick={onToggleMobileMenu}
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            )}
          </div>
        </div>
        <HeroSpider className="nav-spider" />
      </header>

      {/* Mobile Drawer Overlay - 1:1 match of Image 3 */}
      {mobileMenuOpen && (
        <div className="mobile-menu-drawer" role="dialog" aria-modal="true" aria-label="Navigation Menu">
          <div className="mobile-menu-drawer__content">
            <nav className="mobile-nav-list">
              {headerVisibility.home && (
                <Link
                  className={`mobile-nav-card${activeSection === 'home' ? ' is-active' : ''}`}
                  href="/"
                  onClick={closeMenu}
                >
                  <div className="mobile-nav-card__left">
                    <svg className="nav-primary-icon" width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12.707 2.293l9 9c.63.63.184 1.707-.707 1.707h-1v6a3 3 0 0 1-3 3h-1v-7a3 3 0 0 0-2.824-2.995l-.176-.005h-2a3 3 0 0 0-3 3v7h-1a3 3 0 0 1-3-3v-6h-1c-.89 0-1.337-1.077-.707-1.707l9-9a1 1 0 0 1 1.414 0m.293 11.707a1 1 0 0 1 1 1v7h-4v-7a1 1 0 0 1 .883-.993l.117-.007z" />
                    </svg>
                    <span>Home</span>
                  </div>
                  {activeSection === 'home' && <span className="mobile-nav-card__dot" />}
                </Link>
              )}

              {headerVisibility.series && (
                <Link
                  className={`mobile-nav-card${activeSection === 'series' ? ' is-active' : ''}`}
                  href="/series"
                  onClick={closeMenu}
                >
                  <div className="mobile-nav-card__left">
                    <svg className="nav-primary-icon" width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M22 5a1 1 0 0 1-1 1h-8a1 1 0 0 1 0-2h8a1 1 0 0 1 1 1m-3 4a1 1 0 0 1-1 1h-5a1 1 0 0 1 0-2h5a1 1 0 0 1 1 1m3 6a1 1 0 0 1-1 1h-8a1 1 0 0 1 0-2h8a1 1 0 0 1 1 1m-3 4a1 1 0 0 1-1 1h-5a1 1 0 0 1 0-2h5a1 1 0 0 1 1 1m-11-16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2l.001-4.051l.004-.051a1.996 1.996 0 0 1 1.995-1.898zm0 10a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2l.001-4.051l.004-.051a1.996 1.996 0 0 1 1.995-1.898z" />
                    </svg>
                    <span>Series</span>
                  </div>
                  {activeSection === 'series' && <span className="mobile-nav-card__dot" />}
                </Link>
              )}

              {headerVisibility.shop && (
                <Link
                  className="mobile-nav-card"
                  href="/shop"
                  onClick={closeMenu}
                >
                  <div className="mobile-nav-card__left">
                    <ShoppingBag size={19} />
                    <span>Shop</span>
                  </div>
                </Link>
              )}

              {headerVisibility.community && (
                <div className="mobile-nav-group">
                  <Link
                    className="mobile-nav-card"
                    href={communityHref}
                    onClick={closeMenu}
                  >
                    <div className="mobile-nav-card__left">
                      <UsersRound size={19} />
                      <span>Community</span>
                    </div>
                    <ChevronRight size={17} className="mobile-nav-card__chevron" />
                  </Link>

                  <div className="mobile-sub-menu">
                    <Link
                      className="mobile-sub-item"
                      href="/#community"
                      onClick={closeMenu}
                    >
                      <div className="mobile-sub-item__icon">
                        <Trophy size={18} />
                      </div>
                      <div className="mobile-sub-item__text">
                        <span className="mobile-sub-item__title">Leaderboard</span>
                        <span className="mobile-sub-item__sub">Top readers</span>
                      </div>
                    </Link>
                  </div>
                </div>
              )}

              {headerVisibility.bookmarks && (
                <Link
                  className="mobile-nav-card"
                  href="/bookmarks"
                  onClick={closeMenu}
                >
                  <div className="mobile-nav-card__left">
                    <Bookmark size={19} />
                    <span>Bookmarks</span>
                  </div>
                </Link>
              )}

              {headerVisibility.theme && (
                <button
                  type="button"
                  className="mobile-nav-card mobile-theme-card"
                  onClick={onToggleTheme}
                  aria-label="Toggle theme"
                >
                  <div className="mobile-nav-card__left">
                    {dark ? <DarkModeIcon /> : <LightModeIcon />}
                    <span>{dark ? 'Dark Mode' : 'Light Mode'}</span>
                  </div>
                  <span className="mobile-theme-badge">{dark ? 'Dark' : 'Light'}</span>
                </button>
              )}
            </nav>
          </div>

          <div className="mobile-menu-drawer__footer">
            <Link
              className="mobile-drawer-home-btn"
              href="/"
              onClick={closeMenu}
            >
              <svg className="nav-primary-icon" width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.707 2.293l9 9c.63.63.184 1.707-.707 1.707h-1v6a3 3 0 0 1-3 3h-1v-7a3 3 0 0 0-2.824-2.995l-.176-.005h-2a3 3 0 0 0-3 3v7h-1a3 3 0 0 1-3-3v-6h-1c-.89 0-1.337-1.077-.707-1.707l9-9a1 1 0 0 1 1.414 0m.293 11.707a1 1 0 0 1 1 1v7h-4v-7a1 1 0 0 1 .883-.993l.117-.007z" />
              </svg>
              <span>Home</span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
