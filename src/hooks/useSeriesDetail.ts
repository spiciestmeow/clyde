import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSeriesBySlug,
  getCachedSeriesCatalog,
  SERIES_CATALOG_QUERY_KEY,
  type SeriesCatalogResponse,
  type SeriesRecord,
} from '../lib/seriesCatalog';

export function useSeriesDetail(slug: string | undefined | null) {
  const queryClient = useQueryClient();
  const cleanSlug = (slug || '').trim().toLowerCase();

  return useQuery<SeriesRecord | null>({
    queryKey: ['series-detail', cleanSlug],
    queryFn: () => getSeriesBySlug(cleanSlug),
    placeholderData: () => {
      if (!cleanSlug) return undefined;
      // 1. Check in-memory React Query cache first
      const inMemory = queryClient.getQueryData<SeriesCatalogResponse>(SERIES_CATALOG_QUERY_KEY);
      const foundInMemory = inMemory?.items.find(
        (item) => item.slug.toLowerCase() === cleanSlug,
      );
      if (foundInMemory) return foundInMemory;

      // 2. Fall back to localStorage cache if present
      const cached = getCachedSeriesCatalog();
      return cached?.items.find((item) => item.slug.toLowerCase() === cleanSlug);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: Boolean(cleanSlug),
  });
}
