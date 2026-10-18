import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Clock3, Flame, ListFilter, Share2 } from 'lucide-react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import SiteSearch from './components/SiteSearch';
import SiteFooter from './components/SiteFooter';
import SiteHeader from './components/SiteHeader';
import NavigationProgress from './components/NavigationProgress';
import { PopularNowCard, type PopularNowCardItem } from './components/PopularNowCard';
import { MostPopularCard, type MostPopularCardItem } from './components/MostPopularCard';
import { LatestReleaseCard } from './components/LatestReleaseCard';
import { ContinueReadingSection, type ContinueReadingItem } from './components/ContinueReadingSection';
import AdminPage from './pages/AdminPage';
import SeriesDetailPage from './pages/SeriesDetailPage';
import SeriesBrowsePage from './pages/SeriesBrowsePage';
import { toSiteSearchItems, toTrendingSiteSearchItems } from './data/seriesSearchCatalog';
import { useThemeMode } from './hooks/useThemeMode';
import { useSeriesCatalog } from './hooks/useSeriesCatalog';
import type { SeriesRecord } from './lib/seriesCatalog';
import vortexLogo from './assets/vortex-logo.webp';
import assets from '../clone-data/asset-references.json';
import { DEFAULT_SITE_SETTINGS, DEFAULT_HERO_SLIDES, type HeroSlide } from './lib/siteSettings';
import './series-data-status.css';

type Asset = { src: string; srcset: string; alt: string };
const manifest = assets as Asset[];
const RELEASES_PER_PAGE = 36;
const MAX_MOST_POPULAR_SERIES = 9;
const MAX_POPULAR_SERIES = 20;
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
function assetUrl(src: string, width = 400) {
  if (!src) return '';
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
    image.hidden = true;
    if (image.parentElement?.classList.contains('brand')) {
      image.parentElement.classList.add('brand-fallback');
    }
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
  else image.hidden = true;
}
function SectionTitle({ children, icon }: { children: string; icon?: boolean }) {
  return <div className="section-title">{icon && <Flame size={17} fill="currentColor" />}<h2>{children}</h2></div>;
}
function HomePage() {
  const [slide, setSlide] = useState(0);
  const [filter, setFilter] = useState<'Latest' | 'New'>('Latest');
  const [releasePage, setReleasePage] = useState(1);
  const catalogQuery = useSeriesCatalog();
  const seriesItems = catalogQuery.items;
  const searchItems = useMemo(() => toSiteSearchItems(seriesItems), [seriesItems]);
  const trendingSearchItems = useMemo(() => toTrendingSiteSearchItems(seriesItems), [seriesItems]);
  const popularityOrder = useMemo(() => [...seriesItems].sort((left, right) =>
    Number(right.pinned) - Number(left.pinned) ||
    Number(right.rating ?? 0) - Number(left.rating ?? 0) ||
    left.title.localeCompare(right.title),
  ), [seriesItems]);
  const popularCards = useMemo<PopularNowCardItem[]>(() => popularityOrder
    .filter((item) => item.cover)
    .slice(0, MAX_POPULAR_SERIES)
    .map((item) => ({ title: item.title, src: item.cover, href: item.href })), [popularityOrder]);
  const mostPopularItems = useMemo<MostPopularCardItem[]>(() => popularityOrder
    .filter((item) => item.cover)
    .slice(0, MAX_MOST_POPULAR_SERIES)
    .map((item) => ({ title: item.title, src: item.cover, href: item.href, genres: item.genres })), [popularityOrder]);
  const latestReleases = useMemo(() => [...seriesItems].sort((left, right) => {
    const releaseAge = (item: SeriesRecord) => {
      const statuses = item.chapters.map((chapter) => chapter.status.trim().toLocaleLowerCase());
      if (statuses.includes('new')) return 0;
      const dayAges = statuses.flatMap((status) => {
        const match = status.match(/(\d+)\s*days?\s*ago/);
        if (match) return [Number(match[1])];
        if (status === 'yesterday') return [1];
        if (status === 'today') return [0];
        return [];
      });
      return dayAges.length ? Math.min(...dayAges) + 1 : Number.POSITIVE_INFINITY;
    };
    const leftAge = releaseAge(left);
    const rightAge = releaseAge(right);
    if (leftAge !== rightAge) return leftAge < rightAge ? -1 : 1;
    const createdAtDiff = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (Number.isFinite(createdAtDiff) && createdAtDiff !== 0) return createdAtDiff;
    return right.pageNumber - left.pageNumber || right.pageOrder - left.pageOrder || left.title.localeCompare(right.title);
  }), [seriesItems]);
  const continueReadingItems = useMemo<ContinueReadingItem[]>(() => {
    const byTitle = new Map(seriesItems.map((item) => [item.title.toLocaleLowerCase(), item]));
    return continueReadingSeeds.flatMap((seed) => {
      const series = byTitle.get(seed.title.toLocaleLowerCase());
      if (!series?.cover) return [];
      return [{
        ...seed,
        href: series.href,
        coverSrc: assetUrl(series.cover, 300),
      }];
    });
  }, [seriesItems]);
  const { dark, toggleTheme } = useThemeMode();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [siteSettings, setSiteSettings] = useState(DEFAULT_SITE_SETTINGS);
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

    void import('./lib/siteSettings')
      .then(({ getSiteSettings, SITE_SETTINGS_UPDATED_EVENT }) => {
        getSiteSettings().then((settings) => {
          if (active) setSiteSettings(settings);
        });

        const handleUpdate = (e: any) => {
          if (active && e.detail) setSiteSettings(e.detail);
        };
        window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
        return () => window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
      })
      .catch(() => {
        // Keep the default navigation if Supabase is unavailable.
      });

    return () => {
      active = false;
    };
  }, []);
  const visibleReleases = filter === 'New'
    ? latestReleases.filter((release) => release.chapters.some((chapter) => chapter.status === 'New'))
    : latestReleases;
  const releasePageCount = Math.max(1, Math.ceil(visibleReleases.length / RELEASES_PER_PAGE));
  const currentReleasePage = Math.min(releasePage, releasePageCount);
  const pagedReleases = visibleReleases.slice(
    (currentReleasePage - 1) * RELEASES_PER_PAGE,
    currentReleasePage * RELEASES_PER_PAGE,
  );
  const paginationItems = getPaginationItems(releasePageCount, currentReleasePage);
  const slides = (siteSettings.heroSlides && siteSettings.heroSlides.length > 0)
    ? siteSettings.heroSlides
    : DEFAULT_HERO_SLIDES;
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
        logoSrc={vortexLogo}
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
      {catalogQuery.isLoading && <div className="series-data-status" role="status"><p>Loading the series catalog…</p></div>}
      {catalogQuery.isError && <div className="series-data-status" role="alert"><p>The series catalog could not be loaded. Please try again.</p><button type="button" onClick={() => void catalogQuery.refetch()}>Try again</button></div>}
      <main>
        {homepageVisibility.featuredSeries && <section className="hero-area" aria-label="Featured series">
          {slides.length > 1 && <a className="hero-peek peek-left" href={slides[(slide + slides.length - 1) % slides.length].href} onClick={(event) => { event.preventDefault(); moveCarousel(-1); }}>
            <img src={assetUrl(slides[(slide + slides.length - 1) % slides.length].src, 480)} alt={slides[(slide + slides.length - 1) % slides.length].title} loading="lazy" />
          </a>}
          {slides.length > 1 && <a className="hero-peek peek-right" href={slides[(slide + 1) % slides.length].href} onClick={(event) => { event.preventDefault(); moveCarousel(1); }}>
            <img src={assetUrl(slides[(slide + 1) % slides.length].src, 480)} alt={slides[(slide + 1) % slides.length].title} loading="lazy" />
          </a>}
          {slides.length > 1 && <button className="hero-control prev" aria-label="Previous slide" onClick={() => moveCarousel(-1)}><ChevronLeft /></button>}
          <a className="hero-slide" href={slides[slide].href} key={slide}>
            <img className="hero-banner" src={slides[slide].src} srcSet={slides[slide].srcset || undefined} sizes="68vw" alt={slides[slide].title} loading="eager" fetchPriority="high" decoding="async" />
            <h1 className="visually-hidden">Read Manga, Manhwa &amp; Manhua Online</h1>
          </a>
          {slides.length > 1 && <button className="hero-control next" aria-label="Next slide" onClick={() => moveCarousel(1)}><ChevronRight /></button>}
          {slides.length > 1 && <div className="hero-dots">{slides.map((item, i) => <button key={item.title} aria-label={`Go to slide ${i + 1}`} className={i === slide ? 'active' : ''} onClick={() => setSlide(i)} />)}</div>}
        </section>}
        {homepageVisibility.socialPromos && <div className="social-row">
          <div className="social-card"><div><span>Share Vortex Scans</span><small>to your friends</small></div><button className="share-btn" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Share2 size={14} />Share</button></div>
          <div className="social-card"><span>Join Our Socials</span><a className="discord-btn" href="https://discord.gg/2PuMt62fRN"><img src={assetUrl(manifest[5].src, 64)} alt="" />Discord</a></div>
        </div>}
        {homepageVisibility.issueBanner && <section className="issue-banner"><div className="issue-icon">!</div><div className="issue-text"><strong>Need Help or Found an Issue?</strong><span>Report bugs, payment issues, or other problems • Get rewards</span></div><a href="/community/report" className="report-btn">△ &nbsp;Report Issue</a></section>}

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
          >{(popularCards.length >= 4 ? [0, 1, 2] : [0]).flatMap((copyIndex) => popularCards.map((card) => (
            <PopularNowCard
              key={`${copyIndex}-${card.title}`}
              item={card}
              imageSrc={assetUrl(card.src, 400)}
              copyIndex={copyIndex}
            />
          )))}</div><button className="rail-arrow left" onClick={() => railRef.current?.scrollBy({ left: -500, behavior: 'smooth' })} aria-label="Previous popular"><ArrowLeft /></button><button className="rail-arrow right" onClick={() => railRef.current?.scrollBy({ left: 500, behavior: 'smooth' })} aria-label="Next popular"><ArrowRight /></button></div>
        </section>}

        {homepageVisibility.continueReading && continueReadingItems.length > 0 && (
          <ContinueReadingSection items={continueReadingItems} />
        )}

        {homepageVisibility.latestReleases && <section className="latest-section content-width">
          <div className="latest-heading"><div className="section-title"><h2>Latest Releases</h2></div><div className="latest-tabs"><button className={filter === 'Latest' ? 'on' : ''} onClick={() => { setFilter('Latest'); setReleasePage(1); }}><Clock3 size={15} />Latest</button><button className={filter === 'New' ? 'on' : ''} onClick={() => { setFilter('New'); setReleasePage(1); }}><ListFilter size={15} />New</button></div><a className="view-all" href="/latest-updates" aria-label="View All Latest Updates"><ArrowUpRight /></a></div>
          <div className="release-grid">{pagedReleases.map((release) => (
            <LatestReleaseCard
              key={release.slug}
              release={release}
              imageSrc={assetUrl(release.cover, 300)}
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
              <button className="period-control">This week <ChevronDown size={14} /></button>
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
          logoSrc={manifest[0].src}
          tagline="Read Comics, manga, manhua, manhwa, translated swiftly: Vortex, your ultimate library."
        />
      )}
      <button className="pumpkin" aria-label="Trick or treat?"><img src={assetUrl(manifest[1].src, 128)} alt="" /></button>
    </div>
  );
}
function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <NavigationProgress />
      <Switch>
        <Route path="/admin" component={AdminPage} />
        <Route path="/series" component={SeriesBrowsePage} />
        <Route path="/series/:slug" component={SeriesDetailPage} />
        <Route component={HomePage} />
      </Switch>
    </WouterRouter>
  );
}

export default App;