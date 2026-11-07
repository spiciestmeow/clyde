import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  BookOpen,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Filter,
  Flame,
  History,
  Percent,
  RefreshCw,
  Search,
  Star,
  Tag,
  X,
  XCircle,
} from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import SiteSearch from '../components/SiteSearch';
import { CatalogErrorState } from '../components/CatalogErrorState';
import { seriesAvailability, seriesGenres, seriesStatuses, seriesTypes } from '../data/seriesFilterOptions';
import { useThemeMode } from '../hooks/useThemeMode';
import {
  DEFAULT_SERIES_FILTER_VISIBILITY,
  getCachedSiteSettings,
  getSiteSettings,
  SITE_SETTINGS_UPDATED_EVENT,
  type SiteSettings,
} from '../lib/siteSettings';
import { LatestReleaseCard, seriesToRelease } from '../components/LatestReleaseCard';
import { BrowsePageSkeleton } from '../components/HomeSectionSkeletons';
import { getMobilePaginationItems } from '../lib/pagination';
import assets from '../../clone-data/asset-references.json';
import { SeriesBooksIcon } from '../components/icons/SeriesBooksIcon';
import '../series-detail.css';
import '../series-data-status.css';
import './series-browse.css';

import {
  DEFAULT_SERIES_COVER,
  applyBrowseFiltersClientSide,
  sortBrowseResultsClientSide,
  getSiteSearchHighlights,
  searchSiteCatalog,
  SERIES_CATALOG_QUERY_KEY,
  type SeriesBrowseFacets,
  type SeriesRecord,
} from '../lib/seriesCatalog';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';

const assetList = assets as { src: string; alt: string }[];
const PAGE_SIZE = 36;
type SortMode = 'latest' | 'updated' | 'popular' | 'newest' | 'oldest' | 'chapters' | 'title';
type SortDirection = 'desc' | 'asc';
type GenreMode = 'include' | 'exclude';
type FilterSection = 'genres' | 'status' | 'availability' | 'type' | 'chapterCount' | 'releaseDate';
const sortOptions = [
  { value: 'latest', label: 'Latest Chapters', Icon: Clock3 },
  { value: 'updated', label: 'Recently Updated', Icon: RefreshCw },
  { value: 'popular', label: 'Most Popular', Icon: Flame },
  { value: 'newest', label: 'Newest Added', Icon: CalendarPlus },
  { value: 'oldest', label: 'Oldest First', Icon: History },
  { value: 'chapters', label: 'Most Chapters', Icon: BookOpen },
  { value: 'title', label: 'A–Z', Icon: ArrowDownAZ },
] as const;
const referenceLeadOrder = [
  '/series/fantasy-induction-corps',
  "/series/the-academy's-weapon-copycat",
  '/series/archmage-curriculum',
  '/series/dao-of-the-bizarre-immortal',
  "/series/superhuman's-gaming-stream",
  '/series/regressed-blood-demon',
  '/series/a-grimoire-changed-my-fate',
  '/series/i-offered-kimchi-ramen-to-the-gods',
  '/series/reality-quest-2',
];
const referenceLeadRanks = new Map(referenceLeadOrder.map((href, index) => [href, index]));

function imageUrl(source: string, width = 400) {
  if (!source?.trim()) return DEFAULT_SERIES_COVER;
  if (source.startsWith('https://i0.wp.com/')) {
    const url = new URL(source);
    url.searchParams.set('w', String(width));
    return url.toString();
  }
  if (source.startsWith('https://storage.vortexscans.org/')) {
    const url = new URL(source);
    url.searchParams.set('w', String(width));
    return url.toString();
  }
  return source;
}

function recoverImage(event: SyntheticEvent<HTMLDivElement>) {
  const image = event.target as HTMLImageElement;
  if (image.tagName !== 'IMG') return;
  const isCover = image.closest('.release-cover');
  if (image.dataset.fallbackAttempted) {
    if (isCover && image.dataset.fallbackAttempted !== 'placeholder') {
      image.dataset.fallbackAttempted = 'placeholder';
      image.src = DEFAULT_SERIES_COVER;
    } else {
      image.hidden = true;
    }
    return;
  }
  const failed = image.currentSrc || image.src;
  if (failed.startsWith('https://i0.wp.com/')) {
    image.dataset.fallbackAttempted = 'direct';
    image.src = `https://${failed.slice('https://i0.wp.com/'.length).split('?')[0]}`;
  } else if (failed.startsWith('https://storage.vortexscans.org/')) {
    image.dataset.fallbackAttempted = 'direct';
    image.src = `https://i0.wp.com/${failed.slice('https://'.length).split('?')[0]}?w=400&quality=85&strip=all&ssl=1`;
  } else if (isCover) {
    image.dataset.fallbackAttempted = 'placeholder';
    image.src = DEFAULT_SERIES_COVER;
  } else {
    image.dataset.fallbackAttempted = 'failed';
    image.hidden = true;
  }
}

function pageNumbers(pageCount: number, current: number) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const first = Math.max(2, Math.min(current - 2, pageCount - 4));
  const last = Math.min(pageCount - 1, first + 3);
  return [1, ...(first > 2 ? ['…'] : []), ...Array.from({ length: last - first + 1 }, (_, i) => first + i), ...(last < pageCount - 1 ? ['…'] : []), pageCount] as (number | string)[];
}

export default function SeriesBrowsePage() {
  const { dark, toggleTheme } = useThemeMode();
  const { items: allCatalogItems, isLoading, isError, refetch } = useSeriesCatalog();
  const highlightsQuery = useQuery({
    queryKey: [...SERIES_CATALOG_QUERY_KEY, 'series-browse-search-highlights'],
    queryFn: () => getSiteSearchHighlights(4),
    staleTime: 5 * 60 * 1000,
  });
  const searchSeries = useCallback(async (searchTerm: string) => {
    return searchSiteCatalog(searchTerm, 4);
  }, []);
  const routeSearch = useSearch();
  const [location, setLocation] = useLocation();
  const queryFromUrl = new URLSearchParams(routeSearch).get('search') ?? '';
  const [mobileMenu, setMobileMenu] = useState(false);
  const [query, setQuery] = useState(queryFromUrl);
  const [settledQuery, setSettledQuery] = useState(queryFromUrl);
  const [status, setStatus] = useState<string>(() => {
    if (typeof window === 'undefined') return 'All';
    return sessionStorage.getItem('clydee_series_browse_status') || 'All';
  });
  const [availability, setAvailability] = useState<(typeof seriesAvailability)[number]>(() => {
    if (typeof window === 'undefined') return 'Any';
    return (sessionStorage.getItem('clydee_series_browse_availability') as (typeof seriesAvailability)[number]) || 'Any';
  });
  const [selectedTypes, setSelectedTypes] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = sessionStorage.getItem('clydee_series_browse_types');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [minChapters, setMinChapters] = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('clydee_series_browse_min_chapters') || '';
  });
  const [maxChapters, setMaxChapters] = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem('clydee_series_browse_max_chapters') || '';
  });
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [genreSearch, setGenreSearch] = useState('');
  const [genreModes, setGenreModes] = useState<Record<string, GenreMode>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = sessionStorage.getItem('clydee_series_browse_genre_modes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [seriesFilterVisibility, setSeriesFilterVisibility] = useState(
    () => getCachedSiteSettings()?.seriesFilters ?? DEFAULT_SERIES_FILTER_VISIBILITY,
  );
  const [filterSectionsOpen, setFilterSectionsOpen] = useState<Record<FilterSection, boolean>>({
    genres: true,
    status: true,
    availability: true,
    type: true,
    chapterCount: false,
    releaseDate: false,
  });
  const hasExpandedFilterSection = (Object.keys(filterSectionsOpen) as FilterSection[])
    .some((section) => seriesFilterVisibility[section] && filterSectionsOpen[section]);
  const [sort, setSort] = useState<SortMode>('latest');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const discord = assetList.find((item) => item.alt === 'Discord Image Link')?.src ?? '';
  const activeSortLabel = sortOptions.find((option) => option.value === sort)?.label ?? 'Latest Chapters';
  const hasVisibleSeriesFilters = Object.values(seriesFilterVisibility).some(Boolean);
  const activeFilterCount = (seriesFilterVisibility.genres ? Object.keys(genreModes).length : 0) +
    (seriesFilterVisibility.status && status !== 'All' ? 1 : 0) +
    (seriesFilterVisibility.availability && availability !== 'Any' ? 1 : 0) +
    (seriesFilterVisibility.type ? selectedTypes.length : 0) +
    (seriesFilterVisibility.chapterCount ? Number(minChapters !== '') + Number(maxChapters !== '') : 0) +
    (seriesFilterVisibility.releaseDate ? Number(createdAfter !== '') + Number(createdBefore !== '') : 0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem('clydee_series_browse_genre_modes', JSON.stringify(genreModes));
      sessionStorage.setItem('clydee_series_browse_status', status);
      sessionStorage.setItem('clydee_series_browse_availability', availability);
      sessionStorage.setItem('clydee_series_browse_types', JSON.stringify(selectedTypes));
      sessionStorage.setItem('clydee_series_browse_min_chapters', minChapters);
      sessionStorage.setItem('clydee_series_browse_max_chapters', maxChapters);
    } catch {}
  }, [genreModes, status, availability, selectedTypes, minChapters, maxChapters]);
  const updateSearchUrl = (value: string) => {
    const params = new URLSearchParams(routeSearch);
    if (value.trim()) params.set('search', value);
    else params.delete('search');
    const search = params.toString();
    setLocation(`${location}${search ? `?${search}` : ''}`, { replace: true });
  };

  useEffect(() => {
    const nextQuery = new URLSearchParams(routeSearch).get('search') ?? '';
    setQuery((current) => current === nextQuery ? current : nextQuery);
    setPage(1);
  }, [routeSearch]);

  useEffect(() => {
    if (!query.trim()) {
      setSettledQuery('');
      return;
    }
    const timeout = window.setTimeout(() => setSettledQuery(query), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    let active = true;
    const cachedSettings = getCachedSiteSettings();
    if (cachedSettings) setSeriesFilterVisibility(cachedSettings.seriesFilters);
    const handleSettingsUpdate = (event: Event) => {
      const updated = (event as CustomEvent<SiteSettings>).detail;
      if (updated?.seriesFilters) {
        setSeriesFilterVisibility(updated.seriesFilters);
        setPage(1);
      }
    };
    window.addEventListener(SITE_SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
    void getSiteSettings().then((settings) => {
      if (active) setSeriesFilterVisibility(settings.seriesFilters);
    }).catch(() => {
      // Keep the cached/default filter visibility if settings cannot be loaded.
    });
    return () => {
      active = false;
      window.removeEventListener(SITE_SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
    };
  }, []);

  useEffect(() => {
    const title = 'Browse Series | Clydee';
    const description = 'Explore manga, manhwa, and manhua series on Clydee. Search the library and browse the latest chapters.';
    document.title = title;
    const setMeta = (selector: string, attribute: string, value: string, name: string) => {
      let element = document.querySelector<HTMLMetaElement>(selector);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, name);
        document.head.append(element);
      }
      element.content = value;
    };
    setMeta('meta[name="description"]', 'name', description, 'description');
    setMeta('meta[property="og:title"]', 'property', title, 'og:title');
    setMeta('meta[property="og:description"]', 'property', description, 'og:description');
    setMeta('meta[property="og:type"]', 'property', 'website', 'og:type');
  }, []);

  useEffect(() => {
    const scrollbarClass = 'series-document-scrollbar';
    const root = document.documentElement;
    const body = document.body;
    root.classList.add(scrollbarClass);
    body.classList.add(scrollbarClass);
    return () => {
      root.classList.remove(scrollbarClass);
      body.classList.remove(scrollbarClass);
    };
  }, []);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) setSortMenuOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSortMenuOpen(false);
      document.getElementById('catalog-sort-trigger')?.focus();
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    sortMenuRef.current
      ?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')
      ?.focus();
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [sortMenuOpen]);

  useEffect(() => {
    if (!filtersOpen || !window.matchMedia('(max-width: 850px)').matches) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [filtersOpen]);

  const includedGenres = Object.entries(genreModes).filter(([, mode]) => mode === 'include').map(([genre]) => genre);
  const excludedGenres = Object.entries(genreModes).filter(([, mode]) => mode === 'exclude').map(([genre]) => genre);
  const browseOptions = useMemo(() => ({
    page: Math.max(1, page),
    pageSize: PAGE_SIZE,
    search: settledQuery.trim(),
    statuses: !seriesFilterVisibility.status || status === 'All' ? [] :
      ['ongoing', 'releasing'].includes(status.toLocaleLowerCase()) ? ['Ongoing', 'Releasing'] : [status],
    categories: seriesFilterVisibility.type ? selectedTypes : [],
    includeGenres: seriesFilterVisibility.genres ? includedGenres : [],
    excludeGenres: seriesFilterVisibility.genres ? excludedGenres : [],
    minChapters: seriesFilterVisibility.chapterCount && minChapters !== '' ? Number(minChapters) : null,
    maxChapters: seriesFilterVisibility.chapterCount && maxChapters !== '' ? Number(maxChapters) : null,
    createdAfter: seriesFilterVisibility.releaseDate ? createdAfter || null : null,
    createdBefore: seriesFilterVisibility.releaseDate ? createdBefore || null : null,
    availability: seriesFilterVisibility.availability ? availability : 'Any',
    sort,
    direction: sortDirection,
  }), [page, settledQuery, status, selectedTypes, includedGenres.join('|'), excludedGenres.join('|'), minChapters, maxChapters, createdAfter, createdBefore, availability, sort, sortDirection, seriesFilterVisibility]);
  // Derive facets from the shared catalog cache � zero extra Supabase reads.
  const facets = useMemo<SeriesBrowseFacets>(() => {
    const genres = new Set<string>();
    const categories = new Set<string>();
    for (const item of allCatalogItems) {
      for (const genre of item.genres ?? []) if (typeof genre === 'string' && genre.trim()) genres.add(genre.trim());
      if (typeof item.category === 'string' && item.category.trim()) categories.add(item.category.trim());
    }
    return {
      genres: [...genres].sort((a, b) => a.localeCompare(b)),
      categories: [...categories].sort((a, b) => a.localeCompare(b)),
    };
  }, [allCatalogItems]);
  // Filter, sort and paginate entirely in-memory � no additional Supabase request per interaction.
  const filteredAndPagedItems = useMemo<{ totalCount: number; items: SeriesRecord[] }>(() => {
    if (allCatalogItems.length === 0) return { totalCount: 0, items: [] };
    const filtered = applyBrowseFiltersClientSide(allCatalogItems, browseOptions);
    const sorted = sortBrowseResultsClientSide(filtered, browseOptions.sort ?? 'latest', browseOptions.direction ?? 'desc');
    const pageNum = Math.max(1, browseOptions.page ?? 1);
    const pageSize = Math.max(1, browseOptions.pageSize ?? PAGE_SIZE);
    const from = (pageNum - 1) * pageSize;
    return { totalCount: sorted.length, items: sorted.slice(from, from + pageSize) };
  }, [allCatalogItems, browseOptions]);
  const totalCount = filteredAndPagedItems.totalCount;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const goToPage = (nextPage: number) => {
    setPage(nextPage);
    document.querySelector('.catalog-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const visibleItems = filteredAndPagedItems.items;
  const pages = pageNumbers(pageCount, currentPage);
  const mobilePages = getMobilePaginationItems(pageCount, currentPage);
  const visibleGenres = useMemo(() => {
    const list = [...new Set([...seriesGenres, ...(facets.genres)])]
      .filter((genre) => genre.toLocaleLowerCase().includes(genreSearch.trim().toLocaleLowerCase()));

    return list.sort((a, b) => {
      const aMode = genreModes[a];
      const bMode = genreModes[b];
      const aRank = aMode === 'include' ? 2 : aMode === 'exclude' ? 1 : 0;
      const bRank = bMode === 'include' ? 2 : bMode === 'exclude' ? 1 : 0;
      if (aRank !== bRank) return bRank - aRank;
      return a.localeCompare(b);
    });
  }, [facets.genres, genreSearch, genreModes]);

  const genresFilterCount = seriesFilterVisibility.genres ? Object.keys(genreModes).length : 0;
  const statusFilterCount = seriesFilterVisibility.status && status !== 'All' ? 1 : 0;
  const availabilityFilterCount = seriesFilterVisibility.availability && availability !== 'Any' ? 1 : 0;
  const typeFilterCount = seriesFilterVisibility.type ? selectedTypes.length : 0;
  const chapterCountFilterCount = seriesFilterVisibility.chapterCount ? Number(minChapters !== '') + Number(maxChapters !== '') : 0;
  const releaseDateFilterCount = seriesFilterVisibility.releaseDate ? Number(createdAfter !== '') + Number(createdBefore !== '') : 0;
  const visibleTypes = [...new Set([...seriesTypes, ...(facets.categories)])];
  const toggleFilterSection = (section: FilterSection) => {
    setFilterSectionsOpen((current) => ({ ...current, [section]: !current[section] }));
  };
  const cycleGenreMode = (genre: string) => {
    setGenreModes((current) => {
      const next = { ...current };
      if (current[genre] === 'include') next[genre] = 'exclude';
      else if (current[genre] === 'exclude') delete next[genre];
      else next[genre] = 'include';
      return next;
    });
    setPage(1);
  };
  const toggleSeriesType = (type: string) => {
    setSelectedTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
    setPage(1);
  };
  const clearSeriesFilters = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('clydee_series_browse_genre_modes');
      sessionStorage.removeItem('clydee_series_browse_status');
      sessionStorage.removeItem('clydee_series_browse_availability');
      sessionStorage.removeItem('clydee_series_browse_types');
      sessionStorage.removeItem('clydee_series_browse_min_chapters');
      sessionStorage.removeItem('clydee_series_browse_max_chapters');
    }
    setGenreModes({});
    setStatus('All');
    setAvailability('Any');
    setSelectedTypes([]);
    setMinChapters('');
    setMaxChapters('');
    setCreatedAfter('');
    setCreatedBefore('');
    setGenreSearch('');
    setPage(1);
  };
  const clearAllSeriesSearchAndFilters = () => {
    setQuery('');
    updateSearchUrl('');
    clearSeriesFilters();
  };
  const activeSearchTerm = query.trim();
  const handleSortMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + offset + options.length) % options.length;
    event.preventDefault();
    options[nextIndex]?.focus();
  };

  return <div className={`vortex-page series-page catalog-page ${dark ? 'theme-dark' : 'theme-light'}${filtersOpen ? ' has-filter-sheet' : ''}`} onErrorCapture={recoverImage}>
    <SiteHeader
      activeSection="series"
      logoSrc="/clydee-logo.png"
      discordSrc={imageUrl(discord, 64)}
      mobileMenuOpen={mobileMenu}
      onToggleMobileMenu={() => setMobileMenu((open) => !open)}
      dark={dark}
      onToggleTheme={toggleTheme}
      communityHref="/community"
      search={<SiteSearch items={highlightsQuery.data ?? []} trendingItems={highlightsQuery.data ?? []} searchFn={searchSeries} />}
    />
    <main className="catalog-main">
      <header className="catalog-intro">
        <h1><SeriesBooksIcon size={30} className="catalog-title-svg" /> Series</h1>
        <p>Explore a vast array of distinctive and exclusive works on our platform</p>
      </header>
      {isLoading && <BrowsePageSkeleton count={PAGE_SIZE} />}
      {isError && <CatalogErrorState compactMobile onRetry={() => void refetch()} />}
      {!isLoading && (!isError || allCatalogItems.length > 0) && <>
      <div className="catalog-search">
        <Search size={17} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); updateSearchUrl(event.target.value); setPage(1); }}
          placeholder="Search..."
          aria-label="Search series catalog"
          data-testid="input-series-catalog-search"
        />
        {query && <button type="button" onClick={() => { setQuery(''); updateSearchUrl(''); setPage(1); }} aria-label="Clear search" data-testid="button-clear-series-search"><X size={16} /></button>}
      </div>
      {(activeSearchTerm || activeFilterCount > 0) && (
        <div className="catalog-active-search" aria-label="Active filters and search">
          <span className="catalog-active-search-label">ACTIVE:</span>
          {activeSearchTerm && (
            <button
              className="catalog-active-search-chip"
              type="button"
              onClick={() => { setQuery(''); updateSearchUrl(''); setPage(1); }}
              aria-label={`Remove search term ${activeSearchTerm}`}
              data-testid="button-clear-active-series-search"
            >
              <span>"{activeSearchTerm}"</span>
              <X size={10} aria-hidden="true" />
            </button>
          )}
          {seriesFilterVisibility.genres && Object.entries(genreModes).map(([genre, mode]) => (
            <button
              key={genre}
              className={`catalog-active-search-chip is-genre-${mode}`}
              type="button"
              onClick={() => cycleGenreMode(genre)}
              aria-label={`Remove genre ${genre}`}
              data-testid={`chip-active-genre-${genre.toLowerCase().replaceAll(' ', '-')}`}
            >
              <span>{genre}</span>
              <X size={10} aria-hidden="true" />
            </button>
          ))}
          {seriesFilterVisibility.status && status !== 'All' && (
            <button
              className="catalog-active-search-chip"
              type="button"
              onClick={() => { setStatus('All'); setPage(1); }}
              aria-label={`Remove status filter ${status}`}
              data-testid={`chip-active-status-${status.toLowerCase()}`}
            >
              <span>{status}</span>
              <X size={10} aria-hidden="true" />
            </button>
          )}
          {seriesFilterVisibility.availability && availability !== 'Any' && (
            <button
              className="catalog-active-search-chip"
              type="button"
              onClick={() => { setAvailability('Any'); setPage(1); }}
              aria-label={`Remove availability filter ${availability}`}
            >
              <span>{availability}</span>
              <X size={10} aria-hidden="true" />
            </button>
          )}
          {seriesFilterVisibility.type && selectedTypes.map((t) => (
            <button
              key={t}
              className="catalog-active-search-chip"
              type="button"
              onClick={() => toggleSeriesType(t)}
              aria-label={`Remove type filter ${t}`}
              data-testid={`chip-active-type-${t.toLowerCase()}`}
            >
              <span>{t}</span>
              <X size={10} aria-hidden="true" />
            </button>
          ))}
          {seriesFilterVisibility.chapterCount && (minChapters !== '' || maxChapters !== '') && (
            <button
              className="catalog-active-search-chip"
              type="button"
              onClick={() => { setMinChapters(''); setMaxChapters(''); setPage(1); }}
              aria-label="Remove chapter count filter"
            >
              <span>Ch: {minChapters || '0'}-{maxChapters || 'any'}</span>
              <X size={10} aria-hidden="true" />
            </button>
          )}
          {seriesFilterVisibility.releaseDate && (createdAfter !== '' || createdBefore !== '') && (
            <button
              className="catalog-active-search-chip"
              type="button"
              onClick={() => { setCreatedAfter(''); setCreatedBefore(''); setPage(1); }}
              aria-label="Remove release date filter"
            >
              <span>Date: {createdAfter || 'start'} to {createdBefore || 'now'}</span>
              <X size={10} aria-hidden="true" />
            </button>
          )}
          <button
            className="catalog-active-search-clear"
            type="button"
            onClick={clearAllSeriesSearchAndFilters}
            data-testid="button-clear-all-series-filters"
          >
            Clear all
          </button>
        </div>
      )}
      <section className="catalog-results" aria-label="Series catalog">
        <div className="catalog-toolbar">
          <p className="catalog-count" aria-live="polite" data-testid="text-series-result-count">Found {totalCount} series</p>
          <div className="catalog-controls">
            <div className="catalog-sort-wrap" ref={sortMenuRef}>
              <button
                className={`catalog-sort${sortMenuOpen ? ' is-open' : ''}`}
                type="button"
                id="catalog-sort-trigger"
                aria-label={`Sort by ${activeSortLabel}, ${sortDirection === 'desc' ? 'descending' : 'ascending'}`}
                aria-haspopup="menu"
                aria-expanded={sortMenuOpen}
                aria-controls="catalog-sort-menu"
                onClick={() => setSortMenuOpen((open) => !open)}
                data-testid="button-series-sort"
              >
                <ArrowDownWideNarrow size={14} aria-hidden="true" />
                <span className="catalog-sort-copy">
                  <span className="catalog-sort-name">{activeSortLabel}</span>
                  <span className="catalog-sort-direction">{sortDirection === 'desc' ? 'Descending' : 'Ascending'}</span>
                </span>
                <ChevronDown size={12} aria-hidden="true" />
              </button>
              {sortMenuOpen && <div className="catalog-sort-menu" id="catalog-sort-menu" role="menu" aria-labelledby="catalog-sort-trigger" onKeyDown={handleSortMenuKeyDown}>
                <p className="catalog-sort-menu-heading">Sort By</p>
                <div className="catalog-sort-options">
                  {sortOptions.map(({ value, label, Icon }) => {
                    const selected = sort === value;
                    return <button
                      className={`catalog-sort-option${selected ? ' is-selected' : ''}`}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      key={value}
                      onClick={() => { setSort(value); setPage(1); }}
                      data-testid={`button-sort-${value}`}
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span>{label}</span>
                      {selected && <Check className="catalog-sort-check" size={14} aria-hidden="true" />}
                    </button>;
                  })}
                </div>
                <div className="catalog-sort-divider" />
                <p className="catalog-sort-menu-heading">Order</p>
                <div className="catalog-sort-options">
                  <button
                    className={`catalog-sort-option${sortDirection === 'desc' ? ' is-selected' : ''}`}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sortDirection === 'desc'}
                    onClick={() => { setSortDirection('desc'); setPage(1); }}
                    data-testid="button-sort-descending"
                  >
                    <ArrowDownWideNarrow size={14} aria-hidden="true" />
                    <span>Descending</span>
                    {sortDirection === 'desc' && <Check className="catalog-sort-check" size={14} aria-hidden="true" />}
                  </button>
                  <button
                    className={`catalog-sort-option${sortDirection === 'asc' ? ' is-selected' : ''}`}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sortDirection === 'asc'}
                    onClick={() => { setSortDirection('asc'); setPage(1); }}
                    data-testid="button-sort-ascending"
                  >
                    <ArrowUpAZ size={14} aria-hidden="true" />
                    <span>Ascending</span>
                    {sortDirection === 'asc' && <Check className="catalog-sort-check" size={14} aria-hidden="true" />}
                  </button>
                </div>
              </div>}
            </div>
            <button className={`catalog-filter-toggle${filtersOpen ? ' is-open' : ''}`} onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="series-filters-panel" type="button" data-testid="button-series-filters">
              <Filter size={14} /> Filters {activeFilterCount > 0 && <span className="catalog-filter-count">{activeFilterCount}</span>}
            </button>
          </div>
        </div>
        <div className={`catalog-results-layout${filtersOpen ? ' has-filters' : ''}`}>
          {filtersOpen && <button className="catalog-filter-backdrop" type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />}
          <aside
            id="series-filters-panel"
            className={`catalog-filter-drawer${hasExpandedFilterSection ? ' has-expanded-sections' : ''}`}
            aria-label="Series filters"
            aria-hidden={!filtersOpen}
            inert={!filtersOpen}
          >
          <div className="catalog-filter-sheet-handle" aria-hidden="true"><span /></div>
          <div className="catalog-filter-panel">
            <div className="catalog-filter-heading">
              <h2>Filters</h2>
              <div className="catalog-filter-heading-actions">
                {activeFilterCount > 0 && <button className="catalog-clear-filters" type="button" onClick={clearSeriesFilters} data-testid="button-clear-series-filters">Clear all</button>}
                <button className="catalog-filter-close" type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters"><X size={18} /></button>
              </div>
            </div>
            {!hasVisibleSeriesFilters && <p className="catalog-filter-empty">Filters are currently disabled.</p>}
            {seriesFilterVisibility.genres && <section className="catalog-filter-group">
              <button className="catalog-filter-section-toggle" type="button" aria-expanded={filterSectionsOpen.genres} aria-controls="series-filter-genres" onClick={() => toggleFilterSection('genres')}>
                <span><Tag size={14} aria-hidden="true" />Genres{genresFilterCount > 0 && <span className="catalog-filter-section-badge">{genresFilterCount}</span>}</span>
                <ChevronDown className={filterSectionsOpen.genres ? 'is-expanded' : ''} size={14} aria-hidden="true" />
              </button>
              {filterSectionsOpen.genres && <div className="catalog-filter-section-body" id="series-filter-genres">
                <label className="catalog-genre-search">
                  <Search size={14} aria-hidden="true" />
                  <input type="search" value={genreSearch} onChange={(event) => setGenreSearch(event.target.value)} placeholder="Search genres..." aria-label="Search genres" data-testid="input-series-genre-search" />
                </label>
                <p className="catalog-filter-help">Click to include, click again to exclude, click again to reset</p>
                <div className="catalog-genre-options" role="group" aria-label="Genres">
                  {visibleGenres.map((genre) => {
                    const mode = genreModes[genre];
                    return <button
                      key={genre}
                      className={`catalog-genre-option${mode ? ` is-${mode}` : ''}`}
                      type="button"
                      aria-label={`${genre}${mode === 'include' ? ', included' : mode === 'exclude' ? ', excluded' : ''}`}
                      aria-pressed={mode === 'include'}
                      onClick={() => cycleGenreMode(genre)}
                      data-testid={`button-genre-${genre.toLowerCase().replaceAll(' ', '-')}`}
                    >
                      <span className="catalog-genre-check">{mode === 'include' ? <CheckCircle2 size={16} fill="#10b981" color="#ffffff" /> : mode === 'exclude' ? <XCircle size={16} fill="#ef4444" color="#ffffff" /> : <span className="catalog-genre-empty-circle" aria-hidden="true" />}</span>
                      <span>{genre}</span>
                    </button>;
                  })}
                  {visibleGenres.length === 0 && <p className="catalog-filter-empty">No genres match your search.</p>}
                </div>
              </div>}
            </section>}
            {seriesFilterVisibility.status && <section className="catalog-filter-group">
              <button className="catalog-filter-section-toggle" type="button" aria-expanded={filterSectionsOpen.status} aria-controls="series-filter-status" onClick={() => toggleFilterSection('status')}>
                <span><CircleDot size={14} aria-hidden="true" />Status{statusFilterCount > 0 && <span className="catalog-filter-section-badge">{statusFilterCount}</span>}</span>
                <ChevronDown className={filterSectionsOpen.status ? 'is-expanded' : ''} size={14} aria-hidden="true" />
              </button>
              {filterSectionsOpen.status && <div className="catalog-filter-section-body catalog-filter-chips" id="series-filter-status" role="group" aria-label="Status">
                <button className={`catalog-filter-chip${status === 'All' ? ' is-active' : ''}`} type="button" aria-pressed={status === 'All'} onClick={() => { setStatus('All'); setPage(1); }}>All</button>
                {seriesStatuses.map((option) => <button
                  className={`catalog-filter-chip${status === option ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={status === option}
                  key={option}
                  onClick={() => { setStatus(option); setPage(1); }}
                  data-testid={`button-status-${option.toLowerCase().replaceAll(' ', '-')}`}
                >{option}</button>)}
              </div>}
            </section>}
            {seriesFilterVisibility.availability && <section className="catalog-filter-group">
              <button className="catalog-filter-section-toggle" type="button" aria-expanded={filterSectionsOpen.availability} aria-controls="series-filter-availability" onClick={() => toggleFilterSection('availability')}>
                <span><Percent size={14} aria-hidden="true" />Availability{availabilityFilterCount > 0 && <span className="catalog-filter-section-badge">{availabilityFilterCount}</span>}</span>
                <ChevronDown className={filterSectionsOpen.availability ? 'is-expanded' : ''} size={14} aria-hidden="true" />
              </button>
              {filterSectionsOpen.availability && <div className="catalog-filter-section-body catalog-filter-chips" id="series-filter-availability" role="group" aria-label="Availability">
                {seriesAvailability.map((option) => <button
                  className={`catalog-filter-chip${availability === option ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={availability === option}
                  key={option}
                  onClick={() => { setAvailability(option); setPage(1); }}
                  data-testid={`button-availability-${option.toLowerCase().replaceAll(' ', '-')}`}
                >{option === 'On Sale' ? <span className="catalog-chip-sale"><Percent size={10} aria-hidden="true" />On Sale</span> : option}</button>)}
              </div>}
            </section>}
            {seriesFilterVisibility.type && <section className="catalog-filter-group">
              <button className="catalog-filter-section-toggle" type="button" aria-expanded={filterSectionsOpen.type} aria-controls="series-filter-type" onClick={() => toggleFilterSection('type')}>
                <span><BookOpen size={14} aria-hidden="true" />Type{typeFilterCount > 0 && <span className="catalog-filter-section-badge">{typeFilterCount}</span>}</span>
                <ChevronDown className={filterSectionsOpen.type ? 'is-expanded' : ''} size={14} aria-hidden="true" />
              </button>
              {filterSectionsOpen.type && <div className="catalog-filter-section-body catalog-filter-chips" id="series-filter-type" role="group" aria-label="Type">
                {visibleTypes.map((option) => <button
                  className={`catalog-filter-chip${selectedTypes.includes(option) ? ' is-active' : ''}`}
                  type="button"
                  aria-pressed={selectedTypes.includes(option)}
                  key={option}
                  onClick={() => toggleSeriesType(option)}
                  data-testid={`button-type-${option.toLowerCase()}`}
                >{option}</button>)}
              </div>}
            </section>}
            {seriesFilterVisibility.chapterCount && <section className="catalog-filter-group">
              <button className="catalog-filter-section-toggle" type="button" aria-expanded={filterSectionsOpen.chapterCount} aria-controls="series-filter-chapter-count" onClick={() => toggleFilterSection('chapterCount')}>
                <span><BookOpen size={14} aria-hidden="true" />Chapter Count{chapterCountFilterCount > 0 && <span className="catalog-filter-section-badge">{chapterCountFilterCount}</span>}</span>
                <ChevronDown className={filterSectionsOpen.chapterCount ? 'is-expanded' : ''} size={14} aria-hidden="true" />
              </button>
              {filterSectionsOpen.chapterCount && <div className="catalog-filter-section-body" id="series-filter-chapter-count">
                <div className="catalog-filter-number-fields">
                  <label className="catalog-filter-field">
                    <span>Min Chapters</span>
                    <input type="number" min="0" inputMode="numeric" placeholder="0" value={minChapters} onChange={(event) => { setMinChapters(event.target.value); setPage(1); }} data-testid="input-min-chapters" />
                  </label>
                  <label className="catalog-filter-field">
                    <span>Max Chapters</span>
                    <input type="number" min="0" inputMode="numeric" placeholder="999+" value={maxChapters} onChange={(event) => { setMaxChapters(event.target.value); setPage(1); }} data-testid="input-max-chapters" />
                  </label>
                </div>
                {(minChapters !== '' || maxChapters !== '') && <p className="catalog-filter-help catalog-filter-data-note">Uses the latest chapter number captured for each series.</p>}
              </div>}
            </section>}
            {seriesFilterVisibility.releaseDate && <section className="catalog-filter-group">
              <button className="catalog-filter-section-toggle" type="button" aria-expanded={filterSectionsOpen.releaseDate} aria-controls="series-filter-release-date" onClick={() => toggleFilterSection('releaseDate')}>
                <span><CalendarPlus size={14} aria-hidden="true" />Release Date{releaseDateFilterCount > 0 && <span className="catalog-filter-section-badge">{releaseDateFilterCount}</span>}</span>
                <ChevronDown className={filterSectionsOpen.releaseDate ? 'is-expanded' : ''} size={14} aria-hidden="true" />
              </button>
              {filterSectionsOpen.releaseDate && <div className="catalog-filter-section-body" id="series-filter-release-date">
                <div className="catalog-filter-date-fields">
                  <label className="catalog-filter-field">
                    <span>Created After</span>
                    <input type="date" value={createdAfter} onChange={(event) => { setCreatedAfter(event.target.value); setPage(1); }} data-testid="input-created-after" />
                  </label>
                  <label className="catalog-filter-field">
                    <span>Created Before</span>
                    <input type="date" value={createdBefore} onChange={(event) => { setCreatedBefore(event.target.value); setPage(1); }} data-testid="input-created-before" />
                  </label>
                </div>
                {(createdAfter !== '' || createdBefore !== '') && <p className="catalog-filter-help catalog-filter-data-note">Series without a captured date are excluded.</p>}
              </div>}
            </section>}
          </div>
          <div className="catalog-filter-apply"><button type="button" onClick={() => setFiltersOpen(false)}>Show {totalCount} {totalCount === 1 ? 'result' : 'results'}</button></div>
          </aside>
          {isError && <div className="catalog-empty"><CatalogErrorState compactMobile onRetry={() => void refetch()} /></div>}
          {isLoading && <BrowsePageSkeleton count={PAGE_SIZE} />}
          {!isLoading && !isError && visibleItems.length > 0 ? <div className="catalog-grid">
            {visibleItems.map((item) => (
              <LatestReleaseCard
                key={item.href}
                release={seriesToRelease(item)}
                imageSrc={imageUrl(item.cover, 360)}
                variant="series"
              />
            ))}
          </div> : !isLoading && !isError && <div className="catalog-empty">
            <span className="catalog-empty-icon"><Search size={21} /></span>
            <h2>No series found</h2>
            <p>Try another title or reset your filters to see more of the library.</p>
            <button type="button" onClick={clearAllSeriesSearchAndFilters} data-testid="button-reset-series-search">Reset search and filters</button>
          </div>}
        </div>
        {totalCount > PAGE_SIZE && <nav className="catalog-pagination" aria-label="Series pages">
          <button className="catalog-pagination__edge" type="button" aria-label="First page" disabled={currentPage === 1} onClick={() => goToPage(1)} data-testid="button-series-page-first">«</button>
          <button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} data-testid="button-series-page-previous">‹</button>
          <span className="catalog-pagination__numbers catalog-pagination__numbers--desktop">
            {pages.map((item, index) => typeof item === 'string'
              ? <span className="catalog-ellipsis" key={`desktop-dots-${index}`}>…</span>
              : <button type="button" key={item} className={currentPage === item ? 'is-current' : ''} aria-current={currentPage === item ? 'page' : undefined} onClick={() => goToPage(item)} data-testid={`button-series-page-${item}`}>{item}</button>)}
          </span>
          <span className="catalog-pagination__numbers catalog-pagination__numbers--mobile">
            {mobilePages.map((item, index) => item === 'ellipsis'
              ? <span className="catalog-ellipsis" key={`mobile-dots-${index}`}>…</span>
              : <button type="button" key={`mobile-${item}`} className={currentPage === item ? 'is-current' : ''} aria-current={currentPage === item ? 'page' : undefined} onClick={() => goToPage(item)} data-testid={`button-series-page-mobile-${item}`}>{item}</button>)}
          </span>
          <button type="button" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => goToPage(currentPage + 1)} data-testid="button-series-page-next">›</button>
          <button className="catalog-pagination__edge" type="button" aria-label="Last page" disabled={currentPage === pageCount} onClick={() => goToPage(pageCount)} data-testid="button-series-page-last">»</button>
          <span className="catalog-page-status">Page <b>{currentPage}</b> of <b>{pageCount}</b></span>
        </nav>}
      </section>
      </>}
    </main>
    <SiteFooter className="footer series-footer" logoSrc="/clydee-logo.png" tagline="Read comics, manga, manhua, and manhwa translated swiftly. Clydee, your ultimate library." />
  </div>;
}
