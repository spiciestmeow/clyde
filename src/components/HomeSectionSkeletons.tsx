/**
 * Shimmering skeleton cards displayed while the series catalog is loading on first visit.
 * Replaces intrusive "Loading the series catalog…" banners with clean animated placeholders.
 */

export function PopularTodaySkeleton({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div className="popular-card popular-card--skeleton" key={`pop-skel-${i}`} aria-hidden="true">
          <div className="popular-card__card">
            <div className="popular-card__art card-shimmer" />
            <div className="popular-card__title">
              <div className="popular-skeleton-title card-shimmer" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export function LatestReleasesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <article
          className="release-card release-card--series release-card--skeleton"
          key={`release-skel-${i}`}
          aria-hidden="true"
        >
          <div className="release-cover card-shimmer" />
          <div className="release-info" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: 0 }}>
            <div className="card-shimmer" style={{ height: '16px', width: '75%', borderRadius: '6px' }} />
            <div className="card-shimmer" style={{ height: '12px', width: '40%', borderRadius: '4px', marginBottom: '2px' }} />
            <div className="release-boxes" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div className="card-shimmer" style={{ height: '32px', borderRadius: '6px' }} />
              <div className="card-shimmer" style={{ height: '32px', borderRadius: '6px' }} />
              <div className="card-shimmer" style={{ height: '32px', borderRadius: '6px' }} />
            </div>
          </div>
        </article>
      ))}
    </>
  );
}

export function MostPopularSkeleton({ count = 9 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div className="rank-card rank-card--skeleton" key={`rank-skel-${i}`} aria-hidden="true">
          <span className="rank-cover card-shimmer" style={{ width: '44px', height: '62px', borderRadius: '8px', flexShrink: 0 }} />
          <div className="card-shimmer" style={{ width: '18px', height: '24px', borderRadius: '4px', flexShrink: 0 }} />
          <div className="rank-info" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
            <div className="card-shimmer" style={{ height: '14px', width: '80%', borderRadius: '4px' }} />
            <div style={{ display: 'flex', gap: '6px' }}>
              <div className="card-shimmer" style={{ height: '16px', width: '45px', borderRadius: '4px' }} />
              <div className="card-shimmer" style={{ height: '16px', width: '55px', borderRadius: '4px' }} />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
