import { AlertTriangle, RefreshCw } from 'lucide-react';

export function CatalogErrorState({
  onRetry,
  hasCachedData = false,
  compactMobile = false,
}: {
  onRetry: () => void;
  hasCachedData?: boolean;
  compactMobile?: boolean;
}) {
  return (
    <section className={`catalog-error-state${compactMobile ? ' catalog-error-state--compact-mobile' : ''}`} role="alert" aria-labelledby="catalog-error-title">
      <span className="catalog-error-state__icon" aria-hidden="true">
        <AlertTriangle size={19} />
      </span>
      <div className="catalog-error-state__copy">
        <h2 id="catalog-error-title">{hasCachedData ? 'Showing saved catalog data' : 'The series catalog is unavailable'}</h2>
        <p>{hasCachedData
          ? 'We couldn’t refresh the catalog. These results may be out of date, but you can keep browsing while service is unavailable.'
          : 'We couldn’t load series right now. Your reading progress is safe. Please try again or check back later.'}</p>
      </div>
      <button type="button" className="catalog-error-state__retry" onClick={onRetry}>
        <RefreshCw size={15} aria-hidden="true" />
        Try again
      </button>
    </section>
  );
}
