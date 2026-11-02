import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Search, X } from 'lucide-react';
import { useLocation } from 'wouter';

export type SiteSearchItem = {
  title: string;
  href: string;
  cover?: string;
  category?: string | null;
  searchText?: string;
};

export type SiteSearchResponse = { items: SiteSearchItem[]; totalCount: number };

type SiteSearchProps = {
  items: SiteSearchItem[];
  trendingItems: SiteSearchItem[];
  searchFn?: (query: string) => Promise<SiteSearchResponse>;
  className?: string;
};

export default function SiteSearch({
  items,
  trendingItems,
  searchFn,
  className = '',
}: SiteSearchProps) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const normalizedDebouncedQuery = debouncedQuery.trim().toLocaleLowerCase();
  useEffect(() => {
    if (!normalizedQuery) {
      setDebouncedQuery('');
      return;
    }
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query, normalizedQuery]);
  const remoteSearchQuery = useQuery({
    queryKey: ['site-search-results', normalizedDebouncedQuery],
    queryFn: () => searchFn!(normalizedDebouncedQuery),
    enabled: open && Boolean(normalizedDebouncedQuery) && Boolean(searchFn),
    staleTime: 60 * 1000,
  });

  const localMatchingItems = useMemo(() => {
    if (!normalizedQuery || searchFn) return [];

    return items.filter((item) =>
      (item.searchText ?? item.title).toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [items, normalizedQuery, searchFn]);
  const isWaitingForDebounce = Boolean(searchFn && normalizedQuery && normalizedQuery !== normalizedDebouncedQuery);
  const matchingItems = searchFn ? (isWaitingForDebounce ? [] : remoteSearchQuery.data?.items ?? []) : localMatchingItems;
  const matchingCount = searchFn ? (isWaitingForDebounce ? 0 : remoteSearchQuery.data?.totalCount ?? 0) : localMatchingItems.length;
  const visibleItems = useMemo(
    () => (normalizedQuery ? matchingItems : trendingItems).slice(0, 4),
    [matchingItems, normalizedQuery, trendingItems],
  );

  const closeSearch = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);
  const showAllResults = () => {
    const searchTerm = query.trim();
    if (!searchTerm) return;
    navigate(`/series?search=${encodeURIComponent(searchTerm)}`);
    closeSearch();
  };
  const handleSearchButtonClick = () => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      navigate('/series');
      return;
    }
    setOpen(true);
  };

  const renderHighlightedTitle = (title: string) => {
    if (!normalizedQuery) return title;
    const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return title.split(new RegExp(`(${escapedQuery})`, 'gi')).map((part, index) =>
      part.toLocaleLowerCase() === normalizedQuery
        ? <mark className="site-search-highlight" key={`${index}-${part}`}>{part}</mark>
        : part,
    );
  };

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    searchInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSearch();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeSearch, open]);

  return (
    <>
      <button
        type="button"
        className={`nav-search nav-search-trigger ${className}`.trim()}
        aria-label="Search series"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleSearchButtonClick}
      >
        <Search size={15} aria-hidden="true" />
        <span>What are you looking for?</span>
      </button>

      {open &&
        createPortal(
          <div
            className="site-search-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) closeSearch();
            }}
          >
            <section
              className="site-search-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Search series"
            >
              <div className="site-search-dialog__top">
                <div className="site-search-dialog__input">
                  <Search size={14} aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="What are you looking for?"
                    aria-label="Search series"
                    autoComplete="off"
                  />
                  {query && (
                    <button
                      className="site-search-dialog__clear"
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search query"
                      data-testid="button-clear-dialog-search"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <button
                  className="site-search-dialog__close"
                  type="button"
                  onClick={closeSearch}
                  aria-label="Close search"
                >
                  <X size={15} />
                </button>
              </div>

              <h2 className="site-search-dialog__heading">
                {normalizedQuery ? `Results (${matchingCount})` : 'Trending'}
              </h2>

              <div className="site-search-dialog__list">
                {visibleItems.length > 0 ? (
                  visibleItems.map((item) => {
                    const external = item.href.startsWith('https://');

                    return (
                    <a
                      className="site-search-result"
                      href={item.href}
                      key={`${item.href}-${item.title}`}
                      target={external ? '_blank' : undefined}
                      rel={external ? 'noopener noreferrer' : undefined}
                      onClick={closeSearch}
                    >
                      <span className="site-search-result__cover">
                        {item.cover && (
                          <img
                            src={item.cover}
                            alt=""
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                            }}
                          />
                        )}
                      </span>
                      <span className="site-search-result__copy">
                        <span className="site-search-result__category">
                          {item.category || 'Manhwa'}
                        </span>
                        <span className="site-search-result__title">
                          {renderHighlightedTitle(item.title)}
                        </span>
                      </span>
                      <ChevronRight
                        className="site-search-result__arrow"
                        size={14}
                        aria-hidden="true"
                      />
                    </a>
                    );
                  })
                ) : (isWaitingForDebounce || remoteSearchQuery.isFetching) && searchFn ? (
                  <p className="site-search-dialog__empty" role="status">Searching…</p>
                ) : (
                  <p className="site-search-dialog__empty">
                    No matching series found.
                  </p>
                )}
              </div>
              {normalizedQuery && matchingCount > 4 && (
                <button
                  className="site-search-dialog__more"
                  type="button"
                  onClick={showAllResults}
                  data-testid="button-show-more-search-results"
                >
                  Show More ({matchingCount - 4}+)
                </button>
              )}
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
