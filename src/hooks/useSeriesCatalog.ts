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
    initialData: () => getCachedSeriesCatalog() ?? undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    items: query.data?.items ?? [],
    totalCount: query.data?.totalCount ?? 0,
  };
}
