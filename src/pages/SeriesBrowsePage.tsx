import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowUpAZ,
  BookOpen,
  CalendarPlus,
  Check,
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
} from 'lucide-react';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import SiteSearch from '../components/SiteSearch';
import { CatalogErrorState } from '../components/CatalogErrorState';
import { toSiteSearchItems, toTrendingSiteSearchItems } from '../data/seriesSearchCatalog';
import { seriesAvailability, seriesGenres, seriesStatuses, seriesTypes } from '../data/seriesFilterOptions';
import { useThemeMode } from '../hooks/useThemeMode';
import { useSeriesCatalog } from '../hooks/useSeriesCatalog';
import {
  DEFAULT_SERIES_FILTER_VISIBILITY,
  getCachedSiteSettings,
  getSiteSettings,
  SITE_SETTINGS_UPDATED_EVENT,
  type SiteSettings,
} from '../lib/siteSettings';
import { LatestReleaseCard, seriesToRelease } from '../components/LatestReleaseCard';
import { BrowsePageSkeleton } from '../components/HomeSectionSkeletons';
import assets from '../../clone-data/asset-references.json';
import '../series-detail.css';
import '../series-data-status.css';
import './series-browse.css';

import {
  DEFAULT_SERIES_COVER,
  getSeriesReleaseTimestamp,
  getSeriesCreatedTimestamp,
  type SeriesRecord,
} from '../lib/seriesCatalog';

type CatalogItem = SeriesRecord;
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

function latestChapterAge(item: CatalogItem) {
  const chapterStatus = item.chapters[0]?.status.trim().toLowerCase() ?? '';
  if (chapterStatus === 'new') return 0;
  const age = chapterStatus.match(/(\d+(?:\.\d+)?)\s+days?\s+ago/);
  return age ? Number(age[1]) : Number.MAX_SAFE_INTEGER;
}

function latestChapterNumber(item: CatalogItem) {
  const chapterTitle = item.chapters[0]?.title ?? '';
  const number = chapterTitle.match(/(\d+(?:\.\d+)?)\s*$/);
  return number ? Number(number[1]) : 0;
}

function normalizeSeriesDate(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

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
  const catalogQuery = useSeriesCatalog();
  const catalogItems = catalogQuery.items;
  const searchItems = useMemo(() => toSiteSearchItems(catalogItems), [catalogItems]);
  const trendingSearchItems = useMemo(() => toTrendingSiteSearchItems(catalogItems), [catalogItems]);
  const catalogSourceRanks = useMemo(
    () => new Map(catalogItems.map((item, index) => [item.href, index])),
    [catalogItems],
  );
  const routeSearch = useSearch();
  const [location, setLocation] = useLocation();
  const queryFromUrl = new URLSearchParams(routeSearch).get('search') ?? '';
  const [mobileMenu, setMobileMenu] = useState(false);
  const [query, setQuery] = useState(queryFromUrl);
  const [status, setStatus] = useState('All');
  const [availability, setAvailability] = useState<(typeof seriesAvailability)[number]>('Any');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [minChapters, setMinChapters] = useState('');
  const [maxChapters, setMaxChapters] = useState('');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [genreSearch, setGenreSearch] = useState('');
  const [genreModes, setGenreModes] = useState<Record<string, GenreMode>>({});
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

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const includedGenres = Object.entries(genreModes)
      .filter(([, mode]) => mode === 'include')
      .map(([genre]) => genre.toLocaleLowerCase());
    const excludedGenres = Object.entries(genreModes)
      .filter(([, mode]) => mode === 'exclude')
      .map(([genre]) => genre.toLocaleLowerCase());
    const matches = catalogItems.filter((item) => {
      const itemGenres = item.genres.map((genre) => genre.toLocaleLowerCase());
      const hasLockedChapter = item.chapters.some((chapter) => chapter.locked);
      const chapterNumber = latestChapterNumber(item);
      const hasChapterRange = minChapters !== '' || maxChapters !== '';
      const matchesChapterRange = !hasChapterRange || (
        chapterNumber > 0 &&
        (minChapters === '' || chapterNumber >= Number(minChapters)) &&
        (maxChapters === '' || chapterNumber <= Number(maxChapters))
      );
      const seriesDate = normalizeSeriesDate(
        item.year?.toString() ?? item.facts.createdAt ?? item.facts.createdDate ?? item.facts.releaseDate ?? item.facts.released,
      );
      const hasDateRange = createdAfter !== '' || createdBefore !== '';
      const matchesDateRange = !hasDateRange || (
        seriesDate !== null &&
        (createdAfter === '' || seriesDate >= createdAfter) &&
        (createdBefore === '' || seriesDate <= createdBefore)
      );
      // The captured catalog has chapter-lock data but no price flags, so this is the closest available proxy.
      const hasOnlyUnlockedCapturedChapters = item.chapters.length > 0 && !hasLockedChapter;

      const itemStatusNorm = (item.status || '').trim().toLowerCase();
      const filterStatusNorm = status.trim().toLowerCase();
      const matchesStatus =
        !seriesFilterVisibility.status ||
        status === 'All' ||
        itemStatusNorm === filterStatusNorm ||
        ((filterStatusNorm === 'ongoing' || filterStatusNorm === 'releasing') &&
          (itemStatusNorm === 'ongoing' || itemStatusNorm === 'releasing'));

      const itemType = (item.category || item.facts?.type || 'Manhwa').trim().toLowerCase();
      const matchesType =
        !seriesFilterVisibility.type ||
        selectedTypes.length === 0 ||
        selectedTypes.some((t) => t.trim().toLowerCase() === itemType);

      return (!term || `${item.title} ${item.category} ${itemGenres.join(' ')}`.toLocaleLowerCase().includes(term)) &&
        (!seriesFilterVisibility.genres || (
          (includedGenres.length === 0 || includedGenres.some((genre) => itemGenres.includes(genre))) &&
          excludedGenres.every((genre) => !itemGenres.includes(genre))
        )) &&
        matchesStatus &&
        matchesType &&
        (!seriesFilterVisibility.chapterCount || matchesChapterRange) &&
        (!seriesFilterVisibility.releaseDate || matchesDateRange) &&
        (!seriesFilterVisibility.availability || availability === 'Any' ||
          (availability === 'On Sale' && hasLockedChapter) ||
          (availability === 'Full Price' && hasOnlyUnlockedCapturedChapters));
    });
    matches.sort((a, b) => {
      let result = 0;
      if (sort === 'latest') {
        const aTime = getSeriesReleaseTimestamp(a);
        const bTime = getSeriesReleaseTimestamp(b);
        result = bTime - aTime || (getSeriesCreatedTimestamp(b) - getSeriesCreatedTimestamp(a));
      } else if (sort === 'updated') {
        const aTime = getSeriesReleaseTimestamp(a);
        const bTime = getSeriesReleaseTimestamp(b);
        result = bTime - aTime;
      } else if (sort === 'popular') {
        result = Number(b.rating || 0) - Number(a.rating || 0);
      } else if (sort === 'newest') {
        result = getSeriesCreatedTimestamp(b) - getSeriesCreatedTimestamp(a);
      } else if (sort === 'oldest') {
        result = (catalogSourceRanks.get(b.href) ?? 0) - (catalogSourceRanks.get(a.href) ?? 0);
      } else if (sort === 'chapters') {
        result = latestChapterNumber(b) - latestChapterNumber(a);
      } else if (sort === 'title') {
        result = a.title.localeCompare(b.title);
      }
      return sortDirection === 'desc' ? result : -result;
    });
    return matches;
  }, [catalogItems, catalogSourceRanks, query, status, availability, selectedTypes, genreModes, minChapters, maxChapters, createdAfter, createdBefore, sort, sortDirection, seriesFilterVisibility]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pages = pageNumbers(pageCount, currentPage);
  const visibleGenres = [...new Set([...seriesGenres, ...catalogItems.flatMap((item) => item.genres)])]
    .filter((genre) => genre.toLocaleLowerCase().includes(genreSearch.trim().toLocaleLowerCase()));
  const visibleTypes = [...new Set([...seriesTypes, ...catalogItems.map((item) => item.category).filter(Boolean)])];
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
      search={<SiteSearch items={searchItems} trendingItems={trendingSearchItems} />}
    />
    <main className="catalog-main">
      <header className="catalog-intro">
        <h1><span aria-hidden="true" className="catalog-title-mark"><i /><i /><i /></span> Series</h1>
        <p>Explore a vast array of distinctive and exclusive works on our platform</p>
      </header>
      {catalogQuery.isLoading && catalogItems.length === 0 && <BrowsePageSkeleton />}
      {catalogQuery.isError && <CatalogErrorState compactMobile hasCachedData={catalogItems.length > 0} onRetry={() => void catalogQuery.refetch()} />}
      {!catalogQuery.isLoading && (!catalogQuery.isError || catalogItems.length > 0) && <>
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
      {activeSearchTerm && <div className="catalog-active-search" aria-label="Active search">
        <span className="catalog-active-search-label">ACTIVE:</span>
        <button
          className="catalog-active-search-chip"
          type="button"
          onClick={() => { setQuery(''); updateSearchUrl(''); setPage(1); }}
          aria-label={`Remove search term ${activeSearchTerm}`}
          data-testid="button-clear-active-series-search"
        >
          <span>“{activeSearchTerm}”</span>
          <X size={11} aria-hidden="true" />
        </button>
        <button
          className="catalog-active-search-clear"
          type="button"
          onClick={clearAllSeriesSearchAndFilters}
          data-testid="button-clear-all-series-filters"
        >
          Clear all
        </button>
      </div>}
      <section className="catalog-results" aria-label="Series catalog">
        <div className="catalog-toolbar">
          <p className="catalog-count" aria-live="polite" data-testid="text-series-result-count">{activeSearchTerm || activeFilterCount > 0 ? `Found ${filtered.length} series` : `Found ${catalogQuery.totalCount} series`}</p>
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
              <Filter size={14} /> Filters <span className="catalog-filter-count">{activeFilterCount || ''}</span>
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
                <span><Tag size={14} aria-hidden="true" />Genres</span>
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
                      <span className="catalog-genre-check">{mode === 'include' ? <Check size={11} /> : mode === 'exclude' ? <X size={11} /> : null}</span>
                      <span>{genre}</span>
                    </button>;
                  })}
                  {visibleGenres.length === 0 && <p className="catalog-filter-empty">No genres match your search.</p>}
                </div>
              </div>}
            </section>}
            {seriesFilterVisibility.status && <section className="catalog-filter-group">
              <button className="catalog-filter-section-toggle" type="button" aria-expanded={filterSectionsOpen.status} aria-controls="series-filter-status" onClick={() => toggleFilterSection('status')}>
                <span><CircleDot size={14} aria-hidden="true" />Status</span>
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
                <span><Percent size={14} aria-hidden="true" />Availability</span>
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
                <span><BookOpen size={14} aria-hidden="true" />Type</span>
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
                <span><BookOpen size={14} aria-hidden="true" />Chapter Count</span>
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
                <span><CalendarPlus size={14} aria-hidden="true" />Release Date</span>
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
          <div className="catalog-filter-apply"><button type="button" onClick={() => setFiltersOpen(false)}>Show {filtered.length} {filtered.length === 1 ? 'result' : 'results'}</button></div>
          </aside>
          {visibleItems.length ? <div className="catalog-grid">
            {visibleItems.map((item) => (
              <LatestReleaseCard
                key={item.href}
                release={seriesToRelease(item)}
                imageSrc={imageUrl(item.cover, 360)}
                variant="series"
              />
            ))}
          </div> : <div className="catalog-empty">
            <span className="catalog-empty-icon"><Search size={21} /></span>
            <h2>No series found</h2>
            <p>Try another title or reset your filters to see more of the library.</p>
            <button type="button" onClick={clearAllSeriesSearchAndFilters} data-testid="button-reset-series-search">Reset search and filters</button>
          </div>}
        </div>
        {filtered.length > PAGE_SIZE && <nav className="catalog-pagination" aria-label="Series pages">
          <button type="button" aria-label="First page" disabled={currentPage === 1} onClick={() => { setPage(1); document.querySelector('.catalog-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} data-testid="button-series-page-first">«</button>
          <button type="button" aria-label="Previous page" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); document.querySelector('.catalog-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} data-testid="button-series-page-previous">‹</button>
          {pages.map((item, index) => typeof item === 'string'
            ? <span className="catalog-ellipsis" key={`dots-${index}`}>…</span>
            : <button type="button" key={item} className={currentPage === item ? 'is-current' : ''} aria-current={currentPage === item ? 'page' : undefined} onClick={() => { setPage(item); document.querySelector('.catalog-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} data-testid={`button-series-page-${item}`}>{item}</button>)}
          <button type="button" aria-label="Next page" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); document.querySelector('.catalog-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} data-testid="button-series-page-next">›</button>
          <button type="button" aria-label="Last page" disabled={currentPage === pageCount} onClick={() => { setPage(pageCount); document.querySelector('.catalog-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} data-testid="button-series-page-last">»</button>
          <span className="catalog-page-status">Page <b>{currentPage}</b> of <b>{pageCount}</b></span>
        </nav>}
      </section>
      </>}
    </main>
    <SiteFooter className="footer series-footer" logoSrc="/clydee-logo.png" tagline="Read comics, manga, manhua, and manhwa translated swiftly. Clydee, your ultimate library." />
  </div>;
}
