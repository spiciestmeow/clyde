import { Star, Unlock } from 'lucide-react';

export type LatestRelease = {
  title: string;
  href: string;
  cover: string;
  category: string;
  rating: string | null;
  status: string;
  pinned: boolean;
  chapters: { title: string; status: string; href: string }[];
};

type LatestReleaseCardProps = {
  release: LatestRelease;
  imageSrc: string;
};

export function LatestReleaseCard({
  release,
  imageSrc,
}: LatestReleaseCardProps) {
  return (
    <article className="release-card">
      <a className="release-cover" href={release.href} title={release.title}>
        <img src={imageSrc} alt={release.title} loading="lazy" />
        <span className="release-type">{release.category}</span>
        {release.pinned && <span className="release-pinned">Pinned</span>}
      </a>
      <div className="release-info">
        <a className="release-title" href={release.href} title={release.title}>
          {release.title}
        </a>
        <div className="release-meta">
          <span className="release-rating">
            {release.rating ?? '—'} <Star size={12} fill="currentColor" />
          </span>
          <span className="release-status">
            <i />
            {release.status}
          </span>
        </div>
        <div className="release-chapters">
          {release.chapters.map((chapter) => (
            <a className="release-chapter" href={chapter.href} key={chapter.href}>
              <span className="release-chapter-title">{chapter.title}</span>
              {chapter.status === 'Free now' ? (
                <span className="release-chapter-status is-free">
                  <Unlock size={10} />
                  Free now
                </span>
              ) : (
                <span
                  className={`release-chapter-status ${
                    chapter.status === 'New' ? 'is-new' : 'is-old'
                  }`}
                >
                  {chapter.status}
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}
