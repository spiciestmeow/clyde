import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Clock3, Flame, RefreshCw } from 'lucide-react';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import SiteSearch from './components/SiteSearch';
import SiteFooter from './components/SiteFooter';
import SiteHeader from './components/SiteHeader';
import { Shareable } from './components/Shareable';
import { ReportIssue } from './components/ReportIssue';
import NavigationProgress from './components/NavigationProgress';
import HeroSlider from './components/HeroSlider';
import { PopularNowCard, type PopularNowCardItem } from './components/PopularNowCard';
import { MostPopularCard, type MostPopularCardItem } from './components/MostPopularCard';
import { LatestReleaseCard } from './components/LatestReleaseCard';
import { ContinueReadingSection, type ContinueReadingItem } from './components/ContinueReadingSection';
import AdminPage from './pages/AdminPage';
import SeriesDetailPage from './pages/SeriesDetailPage';
import SeriesBrowsePage from './pages/SeriesBrowsePage';
import CreditsPage from './pages/CreditsPage';
import { toSiteSearchItems, toTrendingSiteSearchItems } from './data/seriesSearchCatalog';
import { useThemeMode } from './hooks/useThemeMode';
import { useSeriesCatalog } from './hooks/useSeriesCatalog';
import {
  DEFAULT_SERIES_COVER,
  getSeriesReleaseTimestamp,
  getSeriesReleaseAgeMinutes,
  getSeriesCreatedTimestamp,
  type SeriesRecord,
} from './lib/seriesCatalog';
import assets from '../clone-data/asset-references.json';
import {
  DEFAULT_SITE_SETTINGS,
  getCachedSiteSettings,
  getSiteSettings,
  SITE_SETTINGS_UPDATED_EVENT,
  type HeroSlide,
  type SiteSettings,
} from './lib/siteSettings';
import './series-data-status.css';

type Asset = { src: string; srcset: string; alt: string };
const manifest = assets as Asset[];
const RELEASES_PER_PAGE = 36;
const MAX_MOST_POPULAR_SERIES = 9;
const MAX_POPULAR_SERIES = 20;
const ADMIN_ROUTE = '/panel/7dbf9a4c2e81d603b5a7f0c9e4d2186a';
const collections = manifest.slice(82, 87);
type ContinueReadingSeed = Omit<ContinueReadingItem, 'coverSrc' | 'href'>;
const continueReadingSeeds: ContinueReadingSeed[] = [];
type PaginationItem = number | 'ellipsis';
function getPaginationItems(pageCount: number, currentPage: number): PaginationItem[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  let startPage = Math.max(2, currentPage - 2);
  let endPage = Math.min(pageCount - 1, currentPage + 2);

  if (currentPage <= 4) {
    startPage = 2;
    endPage = 5;
  } else if (currentPage >= pageCount - 3) {
    startPage = pageCount - 4;
    endPage = pageCount - 1;
  }

  const items: PaginationItem[] = [1];
  if (startPage > 2) items.push('ellipsis');
  for (let page = startPage; page <= endPage; page += 1) items.push(page);
  if (endPage < pageCount - 1) items.push('ellipsis');
  items.push(pageCount);
  return items;
}
type RailGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollY: number;
  axis: 'pending' | 'horizontal' | 'vertical';
  moved: boolean;
};
function getRailLoopPeriod(rail: HTMLDivElement) {
  const firstCopy = rail.querySelector<HTMLElement>('[data-loop-copy="0"]');
  const secondCopy = rail.querySelector<HTMLElement>('[data-loop-copy="1"]');
  return firstCopy && secondCopy ? secondCopy.offsetLeft - firstCopy.offsetLeft : 0;
}
function normalizeRailScrollPosition(rail: HTMLDivElement, gesture?: RailGesture | null) {
  const period = getRailLoopPeriod(rail);
  if (period <= 0) return;

  let nextScrollLeft = rail.scrollLeft;
  let adjustment = 0;
  while (nextScrollLeft < period) {
    nextScrollLeft += period;
    adjustment += period;
  }
  while (nextScrollLeft >= period * 2) {
    nextScrollLeft -= period;
    adjustment -= period;
  }

  if (adjustment === 0) return;
  rail.scrollLeft = nextScrollLeft;
  if (gesture?.axis === 'horizontal') {
    gesture.startScrollLeft += adjustment;
  }
}
function assetUrl(src?: string | null, width = 400) {
  if (!src || !src.trim()) return DEFAULT_SERIES_COVER;
  if (src.startsWith('data:')) return src;
  if (src.startsWith('/theme/')) return `https://vortexscans.org${src}`;
  if (src.startsWith('https://i0.wp.com/')) {
    try {
      const url = new URL(src);
      if (url.searchParams.has('w')) url.searchParams.set('w', String(width));
      return url.toString();
    } catch {
      return src;
    }
  }
  if (src.startsWith('https://storage.vortexscans.org/')) {
    try {
      const url = new URL(src);
      url.searchParams.set('w', String(width));
      return url.toString();
    } catch {
      return src;
    }
  }
  return src;
}
function recoverImage(event: SyntheticEvent<HTMLDivElement>) {
  const image = event.target as HTMLImageElement;
  if (image.tagName !== 'IMG') return;
  const failedUrl = image.currentSrc || image.src;
  if (failedUrl.startsWith('data:')) return;
  if (image.dataset.fallbackAttempted) {
    image.src = DEFAULT_SERIES_COVER;
    return;
  }
  image.dataset.fallbackAttempted = 'true';
  image.removeAttribute('srcset');
  let fallback = '';
  if (failedUrl.startsWith('https://i0.wp.com/')) {
    fallback = `https://${failedUrl.slice('https://i0.wp.com/'.length).split('?')[0]}`;
  } else if (failedUrl.startsWith('https://storage.vortexscans.org/')) {
    const path = failedUrl.slice('https://'.length).split('?')[0];
    fallback = `https://i0.wp.com/${path}?w=400&quality=85&strip=all&ssl=1`;
  }
  if (fallback) image.src = fallback;
  else image.src = DEFAULT_SERIES_COVER;
}
function SectionTitle({ children, icon }: { children: string; icon?: boolean }) {
  return <div className="section-title">{icon && <Flame size={17} fill="currentColor" />}<h2>{children}</h2></div>;
}


function HomePage() {
  const [slide, setSlide] = useState(0);
  const [filter, setFilter] = useState<'Latest' | 'New'>('Latest');
  const [popularPeriod, setPopularPeriod] = useState<'This week' | 'Today' | 'All time'>('This week');
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const periodDropdownRef = useRef<HTMLDivElement>(null);
  const [releasePage, setReleasePage] = useState(1);
  const [copiedShare, setCopiedShare] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const handleShare = () => {
    setShareModalOpen(true);
  };

  const catalogQuery = useSeriesCatalog();
  const seriesItems = catalogQuery.items;
  const searchItems = useMemo(() => toSiteSearchItems(seriesItems), [seriesItems]);
  const trendingSearchItems = useMemo(() => toTrendingSiteSearchItems(seriesItems), [seriesItems]);

  useEffect(() => {
    if (!showPeriodDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (periodDropdownRef.current && !periodDropdownRef.current.contains(e.target as Node)) {
        setShowPeriodDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPeriodDropdown]);

  // Section 1: Popular Today (Top 20 trending / pinned / highest rated series)
  const popularCards = useMemo<PopularNowCardItem[]>(() => {
    const sorted = [...seriesItems].sort((left, right) => {
      const pinDiff = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));
      if (pinDiff !== 0) return pinDiff;

      const rightRating = parseFloat(right.rating ?? '0') || 0;
      const leftRating = parseFloat(left.rating ?? '0') || 0;
      if (rightRating !== leftRating) return rightRating - leftRating;

      const chapDiff = right.chapters.length - left.chapters.length;
      if (chapDiff !== 0) return chapDiff;

      return left.title.localeCompare(right.title);
    });

    const seen = new Set<string>();
    const unique = sorted.filter((item) => {
      const key = item.slug || item.href || item.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique
      .slice(0, MAX_POPULAR_SERIES)
      .map((item) => ({ title: item.title, src: item.cover, href: item.href }));
  }, [seriesItems]);

  // Section 3: Most Popular (Top 9 series based on period selection)
  const mostPopularItems = useMemo<MostPopularCardItem[]>(() => {
    const sorted = [...seriesItems].sort((left, right) => {
      const leftRating = parseFloat(left.rating ?? '0') || 0;
      const rightRating = parseFloat(right.rating ?? '0') || 0;

      if (popularPeriod === 'Today') {
        const leftAge = getSeriesReleaseAgeMinutes(left);
        const rightAge = getSeriesReleaseAgeMinutes(right);
        const leftBonus = leftAge <= 1440 ? 1.5 : 0;
        const rightBonus = rightAge <= 1440 ? 1.5 : 0;
        return (Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))) ||
          (rightRating + rightBonus) - (leftRating + leftBonus) ||
          right.chapters.length - left.chapters.length ||
          left.title.localeCompare(right.title);
      }

      if (popularPeriod === 'This week') {
        const leftAge = getSeriesReleaseAgeMinutes(left);
        const rightAge = getSeriesReleaseAgeMinutes(right);
        const leftBonus = leftAge <= 7 * 1440 ? 0.75 : 0;
        const rightBonus = rightAge <= 7 * 1440 ? 0.75 : 0;
        return (Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))) ||
          (rightRating + rightBonus) - (leftRating + leftBonus) ||
          right.chapters.length - left.chapters.length ||
          left.title.localeCompare(right.title);
      }

      // 'All time'
      return (Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))) ||
        rightRating - leftRating ||
        right.chapters.length - left.chapters.length ||
        left.title.localeCompare(right.title);
    });

    return sorted
      .slice(0, MAX_MOST_POPULAR_SERIES)
      .map((item) => ({ title: item.title, src: item.cover, href: item.href, genres: item.genres }));
  }, [seriesItems, popularPeriod]);

  // Section 2: Latest Releases (Sorted by newest chapter drop, preserving catalog order)
  const latestReleases = useMemo(() => [...seriesItems].sort((left, right) => {
    const rightTime = getSeriesReleaseTimestamp(right);
    const leftTime = getSeriesReleaseTimestamp(left);
    if (rightTime !== leftTime) return rightTime - leftTime;

    const rightCreated = getSeriesCreatedTimestamp(right);
    const leftCreated = getSeriesCreatedTimestamp(left);
    if (rightCreated !== leftCreated) return rightCreated - leftCreated;

    return (
      left.pageNumber - right.pageNumber ||
      left.pageOrder - right.pageOrder ||
      left.title.localeCompare(right.title)
    );
  }), [seriesItems]);
  const continueReadingItems = useMemo<ContinueReadingItem[]>(() => {
    const byTitle = new Map(seriesItems.map((item) => [item.title.toLocaleLowerCase(), item]));
    return continueReadingSeeds.flatMap((seed) => {
      const series = byTitle.get(seed.title.toLocaleLowerCase());
      if (!series) return [];
      return [{
        ...seed,
        href: series.href,
        coverSrc: assetUrl(series.cover, 300),
      }];
    });
  }, [seriesItems]);
  const { dark, toggleTheme } = useThemeMode();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() =>
    getCachedSiteSettings() ?? { ...DEFAULT_SITE_SETTINGS, heroSlides: [] },
  );
  const { header: headerVisibility, homepage: homepageVisibility } = siteSettings;
  const railRef = useRef<HTMLDivElement>(null);
  const railGestureRef = useRef<RailGesture | null>(null);
  const suppressRailClickUntilRef = useRef(0);
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const centerRail = () => {
      const period = getRailLoopPeriod(rail);
      if (period > 0) rail.scrollLeft = period;
    };

    centerRail();
    window.addEventListener('resize', centerRail);
    return () => window.removeEventListener('resize', centerRail);
  }, [popularCards.length]);
  useEffect(() => {
    let active = true;

    getSiteSettings()
      .then((settings) => {
        if (active) setSiteSettings(settings);
      })
      .catch(() => {
        // Keep the default navigation if Supabase is unavailable.
      });

    const handleUpdate = (e: any) => {
      if (active && e.detail) setSiteSettings(e.detail);
    };
    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    return () => {
      active = false;
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  const visibleReleases = useMemo(() => {
    if (filter === 'Latest') return latestReleases;

    const filtered = seriesItems.filter((release) => {
      // 1. Explicit admin toggle from series upload/edit
      if (release.isNew) return true;
      if (release.facts?.is_new === 'true') return true;

      // If explicitly set to false by admin, exclude from New tab
      if (release.facts?.is_new === 'false') return false;

      // 2. Fallback for legacy series: check for new chapter status or recent creation
      const hasNewChapter = release.chapters.some((chapter) => {
        const s = chapter.status.trim().toLowerCase();
        return s === 'new' || s === 'just now' || s.includes('min') || s.includes('hour') || s === 'today';
      });
      if (hasNewChapter) return true;

      const releaseAge = getSeriesReleaseAgeMinutes(release);
      if (releaseAge <= 7 * 1440) return true;

      return false;
    });

    // Honor the admin's explicit order for series tagged New; use upload recency for anything not manually ordered.
    return filtered.sort((left, right) => {
      const configuredOrder = siteSettings.newSeriesOrder;
      if (configuredOrder.length > 0) {
        const leftTagged = Boolean(left.isNew || left.facts?.is_new === 'true');
        const rightTagged = Boolean(right.isNew || right.facts?.is_new === 'true');
        if (leftTagged !== rightTagged) return leftTagged ? -1 : 1;

        if (leftTagged && rightTagged) {
          const leftRank = configuredOrder.indexOf(String(left.id));
          const rightRank = configuredOrder.indexOf(String(right.id));
          if (leftRank !== rightRank) {
            if (leftRank === -1) return -1;
            if (rightRank === -1) return 1;
            return leftRank - rightRank;
          }
        }
      }

      const rightCreated = getSeriesCreatedTimestamp(right);
      const leftCreated = getSeriesCreatedTimestamp(left);
      if (rightCreated !== leftCreated) return rightCreated - leftCreated;
      return (right.id || 0) - (left.id || 0);
    });
  }, [filter, latestReleases, seriesItems, siteSettings.newSeriesOrder]);
  const releasePageCount = Math.max(1, Math.ceil(visibleReleases.length / RELEASES_PER_PAGE));
  const currentReleasePage = Math.min(releasePage, releasePageCount);
  const pagedReleases = visibleReleases.slice(
    (currentReleasePage - 1) * RELEASES_PER_PAGE,
    currentReleasePage * RELEASES_PER_PAGE,
  );
  const paginationItems = getPaginationItems(releasePageCount, currentReleasePage);
  const slides = siteSettings.heroSlides;
  const moveCarousel = (direction: number) => setSlide((current) => (current + direction + slides.length) % slides.length);
  const startRailGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    railGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: event.currentTarget.scrollLeft,
      startScrollY: window.scrollY,
      axis: 'pending',
      moved: false,
    };
  };
  const moveRailGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = railGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.axis === 'pending') {
      if (Math.hypot(deltaX, deltaY) < 8) return;
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      gesture.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add('is-dragging');
    }

    event.preventDefault();
    if (gesture.axis === 'horizontal') {
      const rail = event.currentTarget;
      rail.scrollLeft = gesture.startScrollLeft - deltaX;
      normalizeRailScrollPosition(rail, gesture);
    } else {
      const scrollRoot = document.scrollingElement;
      if (scrollRoot) scrollRoot.scrollTop = Math.max(0, gesture.startScrollY - deltaY);
    }
  };
  const endRailGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = railGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.moved) {
      suppressRailClickUntilRef.current = Date.now() + 300;
      event.currentTarget.classList.remove('is-dragging');
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
    railGestureRef.current = null;
  };
  return (
    <div className={`vortex-page ${dark ? 'theme-dark' : 'theme-light'}`} onErrorCapture={recoverImage}>
      <SiteHeader
        activeSection="home"
        logoSrc="/clydee-logo.png"
        discordSrc={assetUrl(manifest[5].src, 64)}
        mobileMenuOpen={mobileMenu}
        onToggleMobileMenu={() => setMobileMenu(!mobileMenu)}
        dark={dark}
        onToggleTheme={toggleTheme}
        visibility={headerVisibility}
        search={
          <SiteSearch
            items={searchItems}
            trendingItems={trendingSearchItems}
          />
        }
      />
      {catalogQuery.isLoading && seriesItems.length === 0 && <div className="series-data-status" role="status"><p>Loading the series catalog…</p></div>}
      {catalogQuery.isError && <div className="series-data-status" role="alert"><p>The series catalog could not be loaded. Please try again.</p><button type="button" onClick={() => void catalogQuery.refetch()}>Try again</button></div>}
      <main>
        {homepageVisibility.featuredSeries && slides.length > 0 && (
          <HeroSlider slides={slides} />
        )}
        {(homepageVisibility.socialPromos || homepageVisibility.issueBanner) && (
          <div className="social-promo-container">
            {homepageVisibility.socialPromos && (
              <div className="social-promo-grid">
                {/* Share Card */}
                <div className="social-card">
                  <div className="social-card-left">
                    <div className="social-card-text">
                      <span className="social-card-title">Share Clydee</span>
                      <span className="social-card-sub">to your friends</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="social-action-btn share-btn"
                    onClick={handleShare}
                    title="Share Clydee"
                  >
                    <svg className="social-btn-icon" width="18" height="18" fill="currentColor" viewBox="0 0 512 512">
                      <path d="M307 34.8c-11.5 5.1-19 16.6-19 29.2v64H176C78.8 128 0 206.8 0 304C0 417.3 81.5 467.9 100.2 478.1c2.5 1.4 5.3 1.9 8.1 1.9c10.9 0 19.7-8.9 19.7-19.7c0-7.5-4.3-14.4-9.8-19.5C108.8 431.9 96 414.4 96 384c0-53 43-96 96-96h96v64c0 12.6 7.4 24.1 19 29.2s25 3 34.4-5.4l160-144c6.7-6.1 10.6-14.7 10.6-23.8s-3.8-17.7-10.6-23.8l-160-144c-9.4-8.5-22.9-10.6-34.4-5.4z" />
                    </svg>
                    <span>Share</span>
                  </button>
                </div>

                {/* Discord Card */}
                <div className="social-card">
                  <div className="social-card-left">
                    <div className="social-card-text">
                      <span className="social-card-title">Join Our Socials</span>
                    </div>
                  </div>
                  <a
                    href="https://discord.gg/2PuMt62fRN"
                    target="_blank"
                    rel="noreferrer"
                    className="social-action-btn discord-btn"
                    title="Join our Discord"
                  >
                    <svg className="social-btn-icon" width="18" height="18" viewBox="0 0 127.14 96.36" fill="currentColor">
                      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                    </svg>
                    <span>Discord</span>
                  </a>
                </div>

                {/* Mobile-only Report Issue button (matches vortexscans.org layout) */}
                {homepageVisibility.issueBanner && (
                  <div className="social-mobile-report">
                    <button
                      type="button"
                      onClick={() => setReportModalOpen(true)}
                      className="social-action-btn report-btn"
                      title="Report Issue"
                    >
                      <svg className="social-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                      </svg>
                      <span>Report Issue</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Desktop Issue Banner */}
            {homepageVisibility.issueBanner && (
              <section className="desktop-issue-banner">
                <div className="issue-banner-card">
                  <div className="issue-banner-left">
                    <span className="issue-banner-accent" aria-hidden="true" />
                    <span className="issue-banner-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M8.478 1.6a.75.75 0 0 1 .273 1.026 3.72 3.72 0 0 0-.425 1.121c.058.058.118.114.18.168A4.491 4.491 0 0 1 12 2.25c1.413 0 2.673.651 3.497 1.668.06-.054.12-.11.178-.167a3.717 3.717 0 0 0-.426-1.125.75.75 0 1 1 1.298-.752 5.22 5.22 0 0 1 .671 2.046.75.75 0 0 1-.187.582c-.241.27-.505.52-.787.749a4.494 4.494 0 0 1 .216 2.1c-.106.792-.753 1.295-1.417 1.403-.182.03-.364.057-.547.081.152.227.273.476.359.742a23.122 23.122 0 0 0 3.832-.803 23.241 23.241 0 0 0-.345-2.634.75.75 0 0 1 1.474-.28c.21 1.115.348 2.256.404 3.418a.75.75 0 0 1-.516.75c-1.527.499-3.119.854-4.76 1.049-.074.38-.22.735-.423 1.05 2.066.209 4.058.672 5.943 1.358a.75.75 0 0 1 .492.75 24.665 24.665 0 0 1-1.189 6.25.75.75 0 0 1-1.425-.47 23.14 23.14 0 0 0 1.077-5.306c-.5-.169-1.009-.32-1.524-.455.068.234.104.484.104.746 0 3.956-2.521 7.5-6 7.5-3.478 0-6-3.544-6-7.5 0-.262.037-.511.104-.746-.514.135-1.022.286-1.522.455.154 1.838.52 3.616 1.077 5.307a.75.75 0 1 1-1.425.468 24.662 24.662 0 0 1-1.19-6.25.75.75 0 0 1 .493-.749 24.586 24.586 0 0 1 4.964-1.24h.01c.321-.046.644-.085.969-.118a2.983 2.983 0 0 1-.424-1.05 24.614 24.614 0 0 1-4.76-1.05.75.75 0 0 1-.516-.75c.057-1.16.194-2.302.405-3.417a.75.75 0 0 1 1.474.28c-.164.862-.28 1.74-.345 2.634 1.237.371 2.517.642 3.832.803.085-.266.207-.515.359-.742a18.698 18.698 0 0 1-.547-.08c-.664-.11-1.311-.612-1.417-1.404a4.535 4.535 0 0 1 .217-2.103 6.788 6.788 0 0 1-.788-.751.75.75 0 0 1-.187-.583 5.22 5.22 0 0 1 .67-2.04.75.75 0 0 1 1.026-.273Z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <div className="issue-banner-text">
                      <h2 className="issue-banner-title">Need Help or Found an Issue?</h2>
                      <p className="issue-banner-sub">Report bugs, or other problems</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setReportModalOpen(true)} className="social-action-btn report-btn">
                    <svg className="social-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                    <span>Report Issue</span>
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {homepageVisibility.popularToday && <section className="popular-section content-width">
          <SectionTitle icon>Popular Today</SectionTitle>
          <div className="cover-rail-wrap"><div
            className="cover-rail"
            ref={railRef}
            onScroll={(event) => normalizeRailScrollPosition(event.currentTarget, railGestureRef.current)}
            onPointerDown={startRailGesture}
            onPointerMove={moveRailGesture}
            onPointerUp={endRailGesture}
            onPointerCancel={endRailGesture}
            onClickCapture={(event) => {
              if (Date.now() < suppressRailClickUntilRef.current) {
                event.preventDefault();
                event.stopPropagation();
                suppressRailClickUntilRef.current = 0;
              }
            }}
          >{popularCards.map((card) => (
            <PopularNowCard
              key={card.href || card.title}
              item={card}
              imageSrc={assetUrl(card.src, 400)}
            />
          ))}</div><button className="rail-arrow left" onClick={() => railRef.current?.scrollBy({ left: -500, behavior: 'smooth' })} aria-label="Previous popular"><ArrowLeft /></button><button className="rail-arrow right" onClick={() => railRef.current?.scrollBy({ left: 500, behavior: 'smooth' })} aria-label="Next popular"><ArrowRight /></button></div>
        </section>}

        {homepageVisibility.continueReading && continueReadingItems.length > 0 && (
          <ContinueReadingSection items={continueReadingItems} />
        )}

        {homepageVisibility.latestReleases && <section className="latest-section content-width">
          <div className="latest-heading"><div className="section-title"><h2>Latest Releases</h2></div><div className="latest-tabs"><button className={filter === 'Latest' ? 'on' : ''} onClick={() => { setFilter('Latest'); setReleasePage(1); }}><RefreshCw size={15} />Latest</button><button className={filter === 'New' ? 'on' : ''} onClick={() => { setFilter('New'); setReleasePage(1); }}><Clock3 size={15} />New</button></div><a className="view-all" href="/latest-updates" aria-label="View All Latest Updates"><ArrowUpRight /></a></div>
          <div className="release-grid">{pagedReleases.map((release) => (
            <LatestReleaseCard
              key={release.slug}
              release={release}
              imageSrc={assetUrl(release.cover, 300)}
              variant="series"
            />
          ))}</div>
          {!catalogQuery.isLoading && !catalogQuery.isError && visibleReleases.length === 0 && <div className="series-data-status" role="status"><p>No series match this release filter yet.</p></div>}
          {visibleReleases.length > 0 && <div className="release-pagination-wrap">
            <nav className="release-pagination" aria-label={`${filter} release pages`}>
              <div className="release-pagination__controls">
                <button
                  type="button"
                  className="release-page-button release-page-button--edge"
                  aria-label="First page"
                  onClick={() => setReleasePage(1)}
                  disabled={currentReleasePage === 1}
                >«</button>
                <button
                  type="button"
                  className="release-page-button"
                  aria-label="Previous page"
                  onClick={() => setReleasePage(currentReleasePage - 1)}
                  disabled={currentReleasePage === 1}
                >‹</button>
              </div>
              <ul className="release-pagination__pages">
                {paginationItems.map((item, index) => item === 'ellipsis'
                  ? <li key={`ellipsis-${index}`}><span className="release-page-button release-page-button--ellipsis" aria-hidden="true">…</span></li>
                  : <li key={item}><button
                    type="button"
                    className={`release-page-button release-page-button--number${item === currentReleasePage ? ' is-current' : ''}`}
                    aria-label={`Page ${item}`}
                    aria-current={item === currentReleasePage ? 'page' : undefined}
                    onClick={() => setReleasePage(item)}
                  >{item}</button></li>)}
              </ul>
              <div className="release-pagination__controls">
                <button
                  type="button"
                  className="release-page-button"
                  aria-label="Next page"
                  onClick={() => setReleasePage(currentReleasePage + 1)}
                  disabled={currentReleasePage === releasePageCount}
                >›</button>
                <button
                  type="button"
                  className="release-page-button release-page-button--edge"
                  aria-label="Last page"
                  onClick={() => setReleasePage(releasePageCount)}
                  disabled={currentReleasePage === releasePageCount}
                >»</button>
              </div>
              <span className="release-pagination__status" aria-live="polite">
                Page <b>{currentReleasePage}</b> of <b>{releasePageCount}</b>
              </span>
            </nav>
          </div>}
        </section>}
        {homepageVisibility.collections && <section className="collection-section content-width"><div className="section-heading"><SectionTitle>Collections</SectionTitle><a className="round-more" href="/collections" aria-label="More collections"><ArrowUpRight size={18} /></a></div><div className="collection-grid">{collections.map((item, i) => {
          const names = ['For beginners','Top Picks','Fantasy Worlds','Marathon Reads','Completed Series'];
          const slug = ['for-beginners','top-picks','fantasy-worlds','marathon-reads','completed-series'][i];
          return <a className="collection-card" href={`/collections/${slug}`} key={slug}><img src={assetUrl(item.src, 400)} alt={item.alt} loading="lazy" /><span>{names[i]}</span></a>;
        })}</div></section>}

        {homepageVisibility.communityActivity && <section id="community" className="community-grid content-width">
          <div className="comments-panel"><div className="section-heading"><SectionTitle>Latest Comments</SectionTitle><a className="round-more" href="/community" aria-label="View all"><ArrowUpRight size={16} /></a></div>
            <div className="comment-list">
              <a className="comment" href="/series/the-legend-of-the-northern-blade/chapter-56#comment-70118"><img src={assetUrl(manifest[87].src, 96)} alt="Naledi Nkonyeni" loading="lazy" /><div><b>Naledi Nkonyeni <time>2m</time></b><p>Look it's the bastard whose sister got turned into sprinkles.</p><small>The Legend of the Northern Blade — Chapter 56</small></div></a>
              <a className="comment" href="/series/the-black-haired-u.s.-army-general#comment-70117"><span className="initial-avatar">R</span><div><b>˚ . ೀreign ་༘࿐⋆｡˚ <time>10m</time></b><p>love how it intertwines real figures let down by the early romance i feel like it shouldve been implemented a little…</p><small>Black-Haired US Army General</small></div></a>
              <a className="comment" href="/series/lumberjack/chapter-1#comment-70116"><span className="initial-avatar">R</span><div><b>˚ . ೀreign ་༘࿐⋆｡˚ <time>10m</time></b><p>so much potential sitting right here, this is like discovering hand jumper when it had 5 chapters</p><small>Lumberjack — Chapter 1</small></div></a>
              <a className="comment" href="/series/the-sword-saint-reincarnated-into-a-noble-mage-family/chapter-14#comment-70115"><img src={assetUrl(manifest[90].src, 96)} alt="Pure Rage" loading="lazy" /><div><b>Pure Rage <time>11m</time></b><p>Nah the swamp people thing is funny asf bc the age to enroll is 12 years old meaning they’ve been there for 10 to 15…</p><small>The Sword Saint Reincarnated into a Noble Mage Family — Chapter 14</small></div></a>
            </div>
          </div>
          <aside className="members-panel"><div className="panel-heading"><h2>Top Members</h2><a href="/leaderboard" aria-label="View all"><ArrowUpRight size={15} /></a></div><a className="top-member" href="/profile/subwaysurf1_18smn"><img src={assetUrl(manifest[91].src, 96)} alt="Subwaysurf1" loading="lazy" /><span><b>Subwaysurf1</b><small>Level 19</small></span><strong>#1</strong></a><ol className="member-list"><li><span>2</span><img src={assetUrl(manifest[92].src, 64)} alt="Nitely" loading="lazy" />Nitely <b>#2</b></li><li><span>3</span><img src={assetUrl(manifest[93].src, 64)} alt="MR_VILLIAN" loading="lazy" />MR_VILLIAN <b>#3</b></li><li><span>4</span><img src={assetUrl(manifest[94].src, 64)} alt="Shin" loading="lazy" />Shin <b>#4</b></li><li><span>5</span><img src={assetUrl(manifest[95].src, 64)} alt="Lyr A" loading="lazy" />Lyr A <b>#5</b></li></ol></aside>
        </section>}
        {homepageVisibility.mostPopular && (
          <section className="most-popular content-width">
            <div className="section-heading">
              <SectionTitle icon>Most Popular</SectionTitle>
              <div ref={periodDropdownRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="period-control"
                  onClick={() => setShowPeriodDropdown((prev) => !prev)}
                  aria-expanded={showPeriodDropdown}
                  aria-haspopup="listbox"
                >
                  {popularPeriod} <ChevronDown size={14} />
                </button>
                {showPeriodDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      right: 0,
                      background: 'var(--panel)',
                      border: '1px solid var(--line)',
                      borderRadius: '8px',
                      padding: '4px',
                      zIndex: 50,
                      minWidth: '110px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    {(['This week', 'Today', 'All time'] as const).map((period) => (
                      <button
                        key={period}
                        type="button"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          width: '100%',
                          padding: '6px 10px',
                          border: 'none',
                          borderRadius: '6px',
                          background: period === popularPeriod ? 'var(--panel-soft)' : 'transparent',
                          color: period === popularPeriod ? 'var(--text)' : 'var(--muted)',
                          fontSize: '11px',
                          fontWeight: period === popularPeriod ? 600 : 400,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.15s, color 0.15s',
                        }}
                        onClick={() => {
                          setPopularPeriod(period);
                          setShowPeriodDropdown(false);
                        }}
                      >
                        {period}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="popular-rank-grid">
              {mostPopularItems.map((item, i) => (
                <MostPopularCard
                  key={item.title}
                  item={item}
                  imageSrc={assetUrl(item.src, 128)}
                  rank={i + 1}
                />
              ))}
            </div>
          </section>
        )}
      </main>
      {homepageVisibility.footer && (
        <SiteFooter
          id="footer"
          logoSrc="/clydee-logo.png"
          tagline="Read Comics, manga, manhua, manhwa, translated swiftly: Clydee, your ultimate library."
        />
      )}
      <Shareable open={shareModalOpen} onOpenChange={setShareModalOpen} />
      <ReportIssue open={reportModalOpen} onOpenChange={setReportModalOpen} />
    </div>
  );
}
function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [location]);

  return null;
}

function ScrollUpActivityButton() {
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const enabled = location === '/' || location === '/series' || location.startsWith('/series/');
    if (!enabled) {
      setVisible(false);
      return;
    }

    let previousScrollY = window.scrollY;
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - previousScrollY;
      previousScrollY = currentScrollY;

      if (currentScrollY <= 100) {
        setVisible(false);
      } else if (delta < -1) {
        setVisible(true);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [location]);

  const enabled = location === '/' || location === '/series' || location.startsWith('/series/');
  if (!enabled) return null;

  return (
    <button
      type="button"
      className={`scroll-up-activity${visible ? ' is-visible' : ''}`}
      aria-label="Scroll to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'smooth' })}
    >
      <ArrowUp size={21} aria-hidden="true" />
    </button>
  );
}

function NotFoundPage() {
  const { dark, toggleTheme } = useThemeMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const catalogQuery = useSeriesCatalog();
  const searchItems = useMemo(() => toSiteSearchItems(catalogQuery.items), [catalogQuery.items]);
  const trendingSearchItems = useMemo(() => toTrendingSiteSearchItems(catalogQuery.items), [catalogQuery.items]);

  return (
    <div className={`vortex-page ${dark ? 'theme-dark' : 'theme-light'}`}>
      <SiteHeader
        activeSection="home"
        logoSrc="/clydee-logo.png"
        discordSrc={assetUrl(manifest[5].src, 64)}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
        dark={dark}
        onToggleTheme={toggleTheme}
        search={<SiteSearch items={searchItems} trendingItems={trendingSearchItems} />}
      />
      <main className="not-found-page" aria-labelledby="not-found-title">
        <h1 id="not-found-title">Page Not Found</h1>
        <p>The page you are looking for does not exist.</p>
      </main>
    </div>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ScrollToTop />
      <ScrollUpActivityButton />
      <NavigationProgress />
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path={ADMIN_ROUTE} component={AdminPage} />
        <Route path="/credits" component={CreditsPage} />
        <Route path="/dmca-policy" component={CreditsPage} />
        <Route path="/series" component={SeriesBrowsePage} />
        <Route path="/series/:slug" component={SeriesDetailPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </WouterRouter>
  );
}

export default App;
