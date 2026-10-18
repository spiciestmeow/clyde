import { CloudUpload, Clock3, History } from 'lucide-react';

export type ContinueReadingItem = {
  title: string;
  href: string;
  coverSrc: string;
  chapter: number;
  progressPercent: number;
  lastRead: string;
  chaptersLeft: number;
};

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
          <h2 id="continue-reading-title">Continue Reading</h2>
          <p>Pick up where you left off</p>
        </div>
      </header>

      <div className="continue-sync-banner">
        <span className="continue-sync-banner__icon" aria-hidden="true">
          <CloudUpload />
        </span>
        <div className="continue-sync-banner__copy">
          <strong>Sync Your Reading History</strong>
          <span>
            Login to sync your reading progress across all devices and never lose
            your place!
          </span>
        </div>
        <a className="continue-sync-banner__action" href="/login">
          Login Now
        </a>
      </div>

      <div className="continue-grid">
        {items.map((item) => (
          <a
            className="continue-card"
            href={item.href}
            key={item.title}
            aria-label={`Continue reading ${item.title}, chapter ${item.chapter}`}
          >
            <span className="continue-card__cover">
              <img src={item.coverSrc} alt={`Cover of ${item.title}`} loading="lazy" />
              <span className="continue-card__cover-progress">
                <span>Chapter {item.chapter}</span>
                <span>{item.progressPercent}%</span>
              </span>
            </span>
            <span className="continue-card__title">{item.title}</span>
            <span className="continue-card__activity">
              <span className="continue-card__last-read">
                <Clock3 aria-hidden="true" />
                {item.lastRead}
              </span>
              <span className="continue-card__remaining">
                <i aria-hidden="true" />
                {item.chaptersLeft} left
              </span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
