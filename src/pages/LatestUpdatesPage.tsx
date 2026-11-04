import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Clock3, Flame, Grid2X2, List, Search, X } from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import SiteSearch from '../components/SiteSearch';
import { CatalogErrorState } from '../components/CatalogErrorState';
import { LatestReleaseCard } from '../components/LatestReleaseCard';
import { LatestReleasesSkeleton } from '../components/HomeSectionSkeletons';
import { useThemeMode } from '../hooks/useThemeMode';
import {
  DEFAULT_SERIES_COVER,
  getSiteSearchHighlights,
  getHomeLatestReleasePage,
  getHomeNewSeriesIndex,
  getSeriesCatalogByIds,
  searchSiteCatalog,
  SERIES_CATALOG_QUERY_KEY,
  type SeriesRecord,
} from '../lib/seriesCatalog';
import { getMobilePaginationItems, getPaginationItems } from '../lib/pagination';
import ResponsivePaginationPages from '../components/ResponsivePaginationPages';
import { triggerNavigationProgress } from '../components/NavigationProgress';
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [newSeriesOrder, setNewSeriesOrder] = useState<string[]>(() => getCachedSiteSettings()?.newSeriesOrder ?? []);
  const highlightsQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'latest-updates-search-highlights'],
    queryFn: () => getSiteSearchHighlights(4),
    staleTime: 5 * 60 * 1000,
  });
  const searchSeries = useCallback(async (query: string) => {
    return searchSiteCatalog(query, 4);
  }, []);
  const hotReleasesQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'latest-updates-hot-page', page, debouncedSearch],
    queryFn: () => getHomeLatestReleasePage(page, PAGE_SIZE, debouncedSearch),
    placeholderData: keepPreviousData,
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'Hot',
  });
  const newSeriesIndexQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'latest-updates-new-index'],
    queryFn: getHomeNewSeriesIndex,
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'New',
  });
  const filteredNewSeries = useMemo(() => {
    const normalizedSearch = debouncedSearch.trim().toLocaleLowerCase();
    const filtered = (newSeriesIndexQuery.data ?? []).filter((release) =>
      !normalizedSearch || release.title.toLocaleLowerCase().includes(normalizedSearch),
    );
    return filtered.sort((left, right) => {
      if (newSeriesOrder.length > 0 && left.isNew !== right.isNew) return left.isNew ? -1 : 1;
      if (left.isNew && right.isNew && newSeriesOrder.length > 0) {
        const leftRank = newSeriesOrder.indexOf(String(left.id));
        const rightRank = newSeriesOrder.indexOf(String(right.id));
        if (leftRank !== rightRank) {
          if (leftRank === -1) return -1;
          if (rightRank === -1) return 1;
          return leftRank - rightRank;
        }
      }
      return Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id - left.id;
    });
  }, [debouncedSearch, newSeriesIndexQuery.data, newSeriesOrder]);
  const pageCount = Math.max(1, Math.ceil((activeTab === 'Hot' ? hotReleasesQuery.data?.totalCount ?? 0 : filteredNewSeries.length) / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const newPageIds = useMemo(
    () => filteredNewSeries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((release) => release.id),
    [currentPage, filteredNewSeries],
  );
  const newReleasesQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'latest-updates-new-page', currentPage, newPageIds],
    queryFn: () => getSeriesCatalogByIds(newPageIds),
    placeholderData: keepPreviousData,
    staleTime: 2 * 60 * 1000,
    enabled: activeTab === 'New' && newSeriesIndexQuery.isSuccess && newPageIds.length > 0,
  });
  const visibleReleases: SeriesRecord[] = activeTab === 'Hot'
    ? hotReleasesQuery.data?.items ?? []
    : newReleasesQuery.data ?? [];
  const visibleCount = activeTab === 'Hot' ? hotReleasesQuery.data?.totalCount ?? 0 : filteredNewSeries.length;
  const isLoadingReleases = activeTab === 'Hot'
    ? hotReleasesQuery.isFetching
    : newSeriesIndexQuery.isFetching || (newPageIds.length > 0 && newReleasesQuery.isFetching);
  const releaseError = activeTab === 'Hot'
    ? hotReleasesQuery.isError
    : newSeriesIndexQuery.isError || newReleasesQuery.isError;
  const retryReleases = () => {
    if (activeTab === 'Hot') void hotReleasesQuery.refetch();
    else if (newSeriesIndexQuery.isError) void newSeriesIndexQuery.refetch();
    else void newReleasesQuery.refetch();
  };

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

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const paginationItems = getPaginationItems(pageCount, currentPage);
  const mobilePaginationItems = getMobilePaginationItems(pageCount, currentPage);
  const firstResult = visibleCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(currentPage * PAGE_SIZE, visibleCount);

  const changeTab = (tab: ReleaseTab) => {
    triggerNavigationProgress();
    setActiveTab(tab);
    setPage(1);
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const changePage = (nextPage: number) => {
    triggerNavigationProgress();
    setPage(nextPage);
    document.querySelector('.latest-updates-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        search={<SiteSearch items={highlightsQuery.data ?? []} trendingItems={highlightsQuery.data ?? []} searchFn={searchSeries} />}
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
            Showing {firstResult} to {lastResult} of {visibleCount} results
          </p>
          {releaseError && visibleReleases.length > 0 && (
            <div className="latest-updates-error">
              <CatalogErrorState hasCachedData onRetry={retryReleases} />
            </div>
          )}
          {releaseError && visibleReleases.length === 0 ? (
            <div className="latest-updates-error"><CatalogErrorState onRetry={retryReleases} /></div>
          ) : isLoadingReleases && visibleReleases.length === 0 ? (
            <div className={`latest-updates-grid${viewMode === 'list' ? ' is-list' : ''}`} aria-label="Loading releases">
              <LatestReleasesSkeleton count={PAGE_SIZE} />
            </div>
          ) : visibleReleases.length === 0 ? (
            <div className="latest-updates-empty" role="status">
              {search.trim() ? 'No results found for your search.' : 'No releases found.'}
            </div>
          ) : isLoadingReleases ? (
            <div className={`latest-updates-grid${viewMode === 'list' ? ' is-list' : ''}`} aria-label="Loading releases">
              <LatestReleasesSkeleton count={PAGE_SIZE} />
            </div>
          ) : (
            <div className={`latest-updates-grid${viewMode === 'list' ? ' is-list' : ''}`}>
              {visibleReleases.map((release) => (
                <LatestReleaseCard
                  key={release.slug}
                  release={release}
                  imageSrc={coverUrl(release.cover, 400)}
                  variant="series"
                />
              ))}
            </div>
          )}
          {visibleCount > PAGE_SIZE && (
            <div className="release-pagination-wrap">
              <nav className="release-pagination" aria-label={`${activeTab} updates pages`}>
                <div className="release-pagination__controls">
                  <button type="button" className="release-page-button release-page-button--edge" aria-label="First page" onClick={() => changePage(1)} disabled={currentPage === 1}>«</button>
                  <button type="button" className="release-page-button" aria-label="Previous page" onClick={() => changePage(currentPage - 1)} disabled={currentPage === 1}>‹</button>
                </div>
                <ResponsivePaginationPages
                  items={paginationItems}
                  mobileItems={mobilePaginationItems}
                  currentPage={currentPage}
                  onSelect={changePage}
                />
                <div className="release-pagination__controls">
                  <button type="button" className="release-page-button" aria-label="Next page" onClick={() => changePage(currentPage + 1)} disabled={currentPage === pageCount}>›</button>
                  <button type="button" className="release-page-button release-page-button--edge" aria-label="Last page" onClick={() => changePage(pageCount)} disabled={currentPage === pageCount}>»</button>
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
