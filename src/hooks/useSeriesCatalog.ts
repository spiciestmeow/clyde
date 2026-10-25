import { useQuery } from '@tanstack/react-query';
import {
  getSeriesCatalog,
  getCachedSeriesCatalog,
  SERIES_CATALOG_QUERY_KEY,
  type SeriesCatalogResponse,
} from '../lib/seriesCatalog';

export function useSeriesCatalog() {
  const query = useQuery<SeriesCatalogResponse>({
    queryKey: SERIES_CATALOG_QUERY_KEY,
    queryFn: getSeriesCatalog,
    placeholderData: () => getCachedSeriesCatalog() ?? undefined,
    staleTime: 5 * 60 * 1000, // 5 minutes cache to avoid excessive egress
    gcTime: 30 * 60 * 1000, // keep in memory for 30 minutes
    refetchOnWindowFocus: false, // do not re-download whole catalog on every window focus
  });

  return {
    ...query,
    items: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
  };
}
