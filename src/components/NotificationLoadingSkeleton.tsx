type NotificationLoadingSkeletonProps = {
  count?: number;
};

/** Reusable placeholder rows shown while notifications are first fetched. */
export default function NotificationLoadingSkeleton({ count = 5 }: NotificationLoadingSkeletonProps) {
  return (
    <div className="notification-skeleton" role="status" aria-label="Loading notifications">
      {Array.from({ length: count }, (_, index) => (
        <div className="notification-skeleton__row" key={index} aria-hidden="true">
          <span className="notification-skeleton__avatar">
            <span className="notification-skeleton__badge" />
          </span>
          <span className="notification-skeleton__copy">
            <span className="notification-skeleton__line notification-skeleton__line--primary" />
            <span className="notification-skeleton__line notification-skeleton__line--secondary" />
            <span className="notification-skeleton__meta">
              <span className="notification-skeleton__line notification-skeleton__line--short" />
              <span className="notification-skeleton__line notification-skeleton__line--medium" />
            </span>
          </span>
          <span className="notification-skeleton__dot" />
        </div>
      ))}
    </div>
  );
}
