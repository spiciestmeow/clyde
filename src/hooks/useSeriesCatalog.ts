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
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    items: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
  };
}
