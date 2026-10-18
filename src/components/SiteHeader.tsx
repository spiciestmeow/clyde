import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bell,
  Bookmark,
  ChevronDown,
  Grid2X2,
  Home,
  Menu,
  Moon,
  ShoppingBag,
  Sun,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Link } from 'wouter';
import HeroSpider from './HeroSpider';
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
  useEffect(() => {
    if (visibility !== undefined && visibilityReady === true) {
      setSavedVisibility(visibility);
      setSavedVisibilityReady(true);
      return;
    }
    if (visibility !== undefined && visibilityReady === false) return;

    let active = true;
    void getSiteSettings()
      .then((settings) => {
        if (active) {
          setSavedVisibility(settings.header);
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

  const useProvidedVisibility = visibility !== undefined && visibilityReady === true;
  const headerVisibility = useProvidedVisibility ? visibility : savedVisibility;
  const isVisibilityReady = useProvidedVisibility || savedVisibilityReady;
  const isSeriesPage = activeSection === 'series';
  const showMenu = isVisibilityReady && (
    headerVisibility.home || headerVisibility.series || headerVisibility.shop || headerVisibility.community
  );
  const navigation = isVisibilityReady ? (
    <nav className={`main-nav${mobileMenuOpen ? ' open' : ''}`}>
      {headerVisibility.home && (
        <Link className={`nav-pill${activeSection === 'home' ? ' selected' : ''}`} href="/">
          <Home size={15} />Home
        </Link>
      )}
      {headerVisibility.series && (
        <Link className={`nav-pill${activeSection === 'series' ? ' selected' : ''}`} href="/series">
          <Grid2X2 size={15} />Series
        </Link>
      )}
      {headerVisibility.shop && (
        <Link className="nav-pill" href="/shop">
          <ShoppingBag size={15} />Shop
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
  ) : null;
  const searchContent = isVisibilityReady && headerVisibility.search && search
    ? search
    : null;
  const actions = isVisibilityReady ? (
    <>
      {headerVisibility.bookmarks && (
        <Link className="bookmark-pill" href="/bookmarks">
          <Bookmark size={15} />
          <span>Bookmarks</span>
        </Link>
      )}
      {headerVisibility.discord && (
        <a className="icon-pill discord-short" href="https://discord.gg/2PuMt62fRN" aria-label="Discord">
          <img src={discordSrc} alt="Discord" />
        </a>
      )}
      {headerVisibility.notifications && (
        <Link className="icon-pill" href="/notifications" aria-label="Notifications">
          <Bell size={16} />
        </Link>
      )}
      {headerVisibility.theme && (
        <button
          className="icon-pill"
          aria-label="Toggle theme"
          onClick={onToggleTheme}
          data-testid={isSeriesPage ? 'button-toggle-series-theme' : undefined}
        >
          {dark ? <Moon size={16} fill="currentColor" /> : <Sun size={16} />}
        </button>
      )}
      {headerVisibility.account && (
        <Link className="icon-pill" href="/login" aria-label="Account">
          <UserRound size={16} />
        </Link>
      )}
    </>
  ) : null;

  return (
    <header className={`topbar${isSeriesPage ? ' series-topbar' : ''}`}>
      <div className="nav-wrap">
        {showMenu && (
          <button
            className="menu-trigger"
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
            onClick={onToggleMobileMenu}
          >
            <Menu />
          </button>
        )}
        <Link href="/" className="brand">
          <img src={logoSrc} alt="Vortex Scans logo" />
        </Link>
        {navigation}
        {searchContent}
        {actions}
      </div>
      <HeroSpider className="nav-spider" />
    </header>
  );
}
