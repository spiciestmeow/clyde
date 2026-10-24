import { Clock3, History, Play } from 'lucide-react';

export type ContinueReadingItem = {
  title: string;
  href: string;
  coverSrc: string;
  chapter: string;
  viewedAt: number;
};

function formatViewedTime(timestamp: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

type ContinueReadingSectionProps = {
  items: ContinueReadingItem[];
};

export function ContinueReadingSection({
  items,
}: ContinueReadingSectionProps) {
  return (
    <section
      className="continue-section content-width"
      id="continue-reading"
      aria-labelledby="continue-reading-title"
    >
      <header className="continue-section__heading">
        <History className="continue-section__heading-icon" aria-hidden="true" />
        <div>
          <h2 id="continue-reading-title">Recently Viewed</h2>
          <p>Pick up with the latest synced chapter</p>
        </div>
      </header>

      <div className="continue-grid">
        {items.map((item) => (
          <a
            className="continue-card"
            href={item.href}
            key={item.title}
            aria-label={`Recently viewed ${item.title}, latest synced chapter ${item.chapter}`}
          >
            <span className="continue-card__cover-shell">
              <span className="continue-card__cover">
                <img src={item.coverSrc} alt={`Cover of ${item.title}`} loading="lazy" />
                <span className="continue-card__hover-action" aria-hidden="true">
                  <span><Play fill="currentColor" /></span>
                </span>
                <span className="continue-card__cover-progress">
                  <span>{item.chapter}</span>
                </span>
              </span>
            </span>
            <span className="continue-card__title">{item.title}</span>
            <span className="continue-card__activity">
              <span className="continue-card__last-read">
                <Clock3 aria-hidden="true" />
                Viewed {formatViewedTime(item.viewedAt)}
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
