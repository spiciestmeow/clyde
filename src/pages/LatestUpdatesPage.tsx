import { useEffect, useMemo, useState } from 'react';
import { Clock3, Flame, Grid2X2, List, Search, X } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import SiteSearch from '../components/SiteSearch';
import { CatalogErrorState } from '../components/CatalogErrorState';
import { LatestReleaseCard } from '../components/LatestReleaseCard';
import { useThemeMode } from '../hooks/useThemeMode';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import { toSiteSearchItems, toTrendingSiteSearchItems } from '../data/seriesSearchCatalog';
import { DEFAULT_SERIES_COVER } from '../lib/seriesCatalog';
import { getNewSeriesReleases, sortLatestReleases } from '../lib/latestReleases';
import { getPaginationItems } from '../lib/pagination';
import {
  getCachedSiteSettings,
  getSiteSettings,
  SITE_SETTINGS_UPDATED_EVENT,
  type SiteSettings,
} from '../lib/siteSettings';
import assets from '../../clone-data/asset-references.json';
import '../series-data-status.css';
import './latest-updates.css';

const assetReferences = assets as { src: string }[];
const PAGE_SIZE = 12;
type ReleaseTab = 'Hot' | 'New';
type ViewMode = 'grid' | 'list';

function coverUrl(source?: string | null, width = 400) {
  if (!source?.trim()) return DEFAULT_SERIES_COVER;
  if (source.startsWith('https://i0.wp.com/') || source.startsWith('https://storage.vortexscans.org/')) {
    try {
      const url = new URL(source);
      url.searchParams.set('w', String(width));
      return url.toString();
    } catch {
      return source;
    }
  }
  return source;
}

function LatestUpdatesPage() {
  const { dark, toggleTheme } = useThemeMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ReleaseTab>('Hot');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const catalogQuery = useSeriesCatalog();
  const [newSeriesOrder, setNewSeriesOrder] = useState<string[]>(() => getCachedSiteSettings()?.newSeriesOrder ?? []);

  const searchItems = useMemo(() => toSiteSearchItems(catalogQuery.items), [catalogQuery.items]);
  const trendingSearchItems = useMemo(() => toTrendingSiteSearchItems(catalogQuery.items), [catalogQuery.items]);
  const latestReleases = useMemo(() => sortLatestReleases(catalogQuery.items), [catalogQuery.items]);
  const newReleases = useMemo(
    () => getNewSeriesReleases(catalogQuery.items, newSeriesOrder),
    [catalogQuery.items, newSeriesOrder],
  );
  const visibleReleases = useMemo(() => {
    const source = activeTab === 'Hot' ? latestReleases : newReleases;
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return normalizedSearch
      ? source.filter((release) => release.title.toLocaleLowerCase().includes(normalizedSearch))
      : source;
  }, [activeTab, latestReleases, newReleases, search]);

  useEffect(() => {
    let active = true;
    getSiteSettings().then((settings) => {
      if (active) setNewSeriesOrder(settings.newSeriesOrder);
    }).catch(() => undefined);
    const handleUpdate = (event: Event) => {
      const settings = (event as CustomEvent<SiteSettings>).detail;
      if (settings?.newSeriesOrder) setNewSeriesOrder(settings.newSeriesOrder);
    };
    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    return () => {
      active = false;
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  const pageCount = Math.max(1, Math.ceil(visibleReleases.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginationItems = getPaginationItems(pageCount, currentPage);
  const pagedReleases = visibleReleases.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstResult = visibleReleases.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(currentPage * PAGE_SIZE, visibleReleases.length);

  const changeTab = (tab: ReleaseTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className={`vortex-page latest-updates-route ${dark ? 'theme-dark' : 'theme-light'}`}>
      <SiteHeader
        activeSection="home"
        logoSrc="/clydee-logo.png"
        discordSrc={assetReferences[5]?.src ?? ''}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
        dark={dark}
        onToggleTheme={toggleTheme}
        search={<SiteSearch items={searchItems} trendingItems={trendingSearchItems} />}
      />
      <main className="latest-updates-main" aria-labelledby="latest-updates-title">
        <header className="latest-updates-intro">
          <h1 id="latest-updates-title">Latest Updates</h1>
          <p>Stay up to date with the newest chapters and releases</p>
        </header>

        <div className="latest-updates-toolbar">
          <div className="latest-updates-controls">
            <div className="latest-updates-tabs" role="tablist" aria-label="Release category">
              <button type="button" role="tab" aria-selected={activeTab === 'Hot'} className={activeTab === 'Hot' ? 'is-active' : ''} onClick={() => changeTab('Hot')}>
                <Flame size={15} />Hot
              </button>
              <button type="button" role="tab" aria-selected={activeTab === 'New'} className={activeTab === 'New' ? 'is-active' : ''} onClick={() => changeTab('New')}>
                <Clock3 size={15} />New
              </button>
            </div>
            <div className="latest-updates-view-toggle" role="group" aria-label="Update layout">
              <button type="button" aria-label="Grid view" title="Grid view" aria-pressed={viewMode === 'grid'} className={viewMode === 'grid' ? 'is-active' : ''} onClick={() => setViewMode('grid')}>
                <Grid2X2 size={15} />
              </button>
              <button type="button" aria-label="List view" title="List view" aria-pressed={viewMode === 'list'} className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')}>
                <List size={15} />
              </button>
            </div>
          </div>

          <label className="latest-updates-search">
            <Search size={16} aria-hidden="true" />
            <input type="search" value={search} onChange={(event) => changeSearch(event.target.value)} placeholder="Search updates..." aria-label="Search updates" />
            {search && <button type="button" aria-label="Clear search" onClick={() => changeSearch('')}><X size={15} /></button>}
          </label>
        </div>

        <section className="latest-updates-results" aria-label="Latest releases" aria-live="polite">
          <p className="latest-updates-count">
            Showing {firstResult} to {lastResult} of {visibleReleases.length} results
          </p>
          {catalogQuery.isError && catalogQuery.items.length > 0 && (
            <div className="latest-updates-error">
              <CatalogErrorState hasCachedData onRetry={() => void catalogQuery.refetch()} />
            </div>
          )}
          {catalogQuery.isLoading && catalogQuery.items.length === 0 ? (
            <div className="latest-updates-empty" role="status">Loading latest releases…</div>
          ) : catalogQuery.isError && catalogQuery.items.length === 0 ? (
            <div className="latest-updates-error"><CatalogErrorState onRetry={() => void catalogQuery.refetch()} /></div>
          ) : pagedReleases.length === 0 ? (
            <div className="latest-updates-empty" role="status">
              {search.trim() ? 'No results found for your search.' : 'No releases found.'}
            </div>
          ) : (
            <div className={`latest-updates-grid${viewMode === 'list' ? ' is-list' : ''}`}>
              {pagedReleases.map((release) => (
                <LatestReleaseCard
                  key={release.slug}
                  release={release}
                  imageSrc={coverUrl(release.cover, 400)}
                  variant="series"
                />
              ))}
            </div>
          )}
          {visibleReleases.length > PAGE_SIZE && (
            <div className="release-pagination-wrap">
              <nav className="release-pagination" aria-label={`${activeTab} updates pages`}>
                <div className="release-pagination__controls">
                  <button type="button" className="release-page-button release-page-button--edge" aria-label="First page" onClick={() => setPage(1)} disabled={currentPage === 1}>«</button>
                  <button type="button" className="release-page-button" aria-label="Previous page" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}>‹</button>
                </div>
                <ul className="release-pagination__pages">
                  {paginationItems.map((item, index) => item === 'ellipsis'
                    ? <li key={`ellipsis-${index}`}><span className="release-page-button release-page-button--ellipsis" aria-hidden="true">…</span></li>
                    : <li key={item}><button
                      type="button"
                      className={`release-page-button release-page-button--number${item === currentPage ? ' is-current' : ''}`}
                      aria-label={`Page ${item}`}
                      aria-current={item === currentPage ? 'page' : undefined}
                      onClick={() => setPage(item)}
                    >{item}</button></li>)}
                </ul>
                <div className="release-pagination__controls">
                  <button type="button" className="release-page-button" aria-label="Next page" onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount}>›</button>
                  <button type="button" className="release-page-button release-page-button--edge" aria-label="Last page" onClick={() => setPage(pageCount)} disabled={currentPage === pageCount}>»</button>
                </div>
                <span className="release-pagination__status" aria-live="polite">Page <b>{currentPage}</b> of <b>{pageCount}</b></span>
              </nav>
            </div>
          )}
        </section>
      </main>
      <SiteFooter
        className="footer latest-updates-footer"
        logoSrc="/clydee-logo.png"
        tagline="Read comics, manga, manhua, and manhwa translated swiftly. Clydee, your ultimate library."
      />
    </div>
  );
}

export default LatestUpdatesPage;
