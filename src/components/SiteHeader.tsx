import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  Grid2X2,
  Home,
  Menu,
  Moon,
  ShoppingBag,
  Sun,
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
          <Home size={15} />
          <span>Home</span>
        </Link>
      )}
      {headerVisibility.series && (
        <Link className={`nav-pill${activeSection === 'series' ? ' selected' : ''}`} href="/series">
          <Grid2X2 size={15} />
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
                {dark ? <Moon size={18} fill="currentColor" /> : <Sun size={18} />}
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
                    <Home size={19} />
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
                    <Grid2X2 size={19} />
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
                    {dark ? <Moon size={19} fill="currentColor" /> : <Sun size={19} />}
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
              <Home size={18} />
              <span>Home</span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
