import { queryClient } from './queryClient';
import { invalidateCatalogCache, SERIES_CATALOG_QUERY_KEY } from './seriesCatalog';
import { getSiteSettings, SITE_SETTINGS_UPDATED_EVENT } from './siteSettings';

let refreshPromise: Promise<void> | null = null;

export async function refreshActiveData(): Promise<void> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      invalidateCatalogCache();
      await Promise.allSettled([
        queryClient.invalidateQueries({
          queryKey: SERIES_CATALOG_QUERY_KEY,
          refetchType: 'active',
        }),
        getSiteSettings(true).then((settings) => {
          window.dispatchEvent(
            new CustomEvent(SITE_SETTINGS_UPDATED_EVENT, { detail: settings })
          );
        }),
      ]);
    } catch (err) {
      console.warn('Realtime refresh error:', err);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
