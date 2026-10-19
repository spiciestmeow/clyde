import { Eye, Lock, Star, Unlock } from 'lucide-react';

export type LatestRelease = {
  title: string;
  href: string;
  cover: string;
  category: string;
  rating: string | null;
  status: string;
  pinned: boolean;
  chapters: { title: string; status: string; href: string }[];
  author?: string | null;
  artist?: string | null;
  sources?: { name: string; url: string }[] | null;
  publishers?: string[] | null;
  favorites?: string | number | null;
  facts?: Record<string, string | null> | null;
};

type LatestReleaseCardProps = {
  release: LatestRelease;
  imageSrc: string;
};

function cleanCredit(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined' ||
    trimmed.toLowerCase() === 'n/a' ||
    trimmed.toLowerCase() === 'none'
  ) {
    return null;
  }
  return trimmed;
}

function getSourcesDisplay(release: LatestRelease): string {
  if (release.sources && release.sources.length > 0) {
    const names = release.sources.map((s) => s.name).filter(Boolean);
    if (names.length > 0) return names.join(', ');
  }
  if (release.publishers && release.publishers.length > 0) {
    return release.publishers.join(', ');
  }
  if (release.facts) {
    const factSource =
      release.facts['Source'] ||
      release.facts['source'] ||
      release.facts['Publisher'] ||
      release.facts['publisher'] ||
      release.facts['Original publisher'];
    if (factSource) return factSource;
  }
  return 'Original';
}

function formatViews(favorites?: string | number | null): string {
  if (!favorites) return '—';
  if (typeof favorites === 'number') {
    return favorites >= 1000 ? `${(favorites / 1000).toFixed(1)}k` : String(favorites);
  }
  const parsed = parseFloat(favorites);
  if (!Number.isNaN(parsed) && !favorites.includes('k') && !favorites.includes('M')) {
    return parsed >= 1000 ? `${(parsed / 1000).toFixed(1)}k` : favorites;
  }
  return favorites;
}

export function LatestReleaseCard({
  release,
  imageSrc,
}: LatestReleaseCardProps) {
  const author = cleanCredit(release.author);
  const artist = cleanCredit(release.artist);
  const isSameAuthorArtist = Boolean(
    author && artist && author.toLowerCase() === artist.toLowerCase()
  );

  const sourcesValue = getSourcesDisplay(release);
  const viewsValue = formatViews(release.favorites);

  // Latest chapter
  const latestChapter = release.chapters[0];

  return (
    <article className="release-card">
      <a className="release-cover" href={release.href} title={release.title}>
        <img src={imageSrc} alt={release.title} loading="lazy" />
        <span className="release-type">{release.category}</span>
        {release.pinned && <span className="release-pinned">Pinned</span>}
        <span className="release-views">
          <Eye size={10} />
          {viewsValue}
        </span>
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

        <div className="release-card-rows">
          {/* Chapter Box (Amber accent) */}
          {latestChapter ? (
            <a className="release-card-row release-card-row--chapter" href={latestChapter.href}>
              <div className="release-card-row-left">
                <Lock size={12} className="chapter-lock-icon" />
                <span className="chapter-number">{latestChapter.title}</span>
              </div>
              <div className="release-card-row-right">
                {latestChapter.status.trim().toLowerCase() === 'new' ? (
                  <span className="chapter-badge is-new">
                    <span className="pumpkin-emoji">🎃</span> New
                  </span>
                ) : latestChapter.status === 'Free now' ? (
                  <span className="chapter-badge is-free">
                    <Unlock size={10} />
                    Free now
                  </span>
                ) : (
                  <span className="chapter-badge is-time">
                    {latestChapter.status}
                  </span>
                )}
              </div>
            </a>
          ) : (
            <div className="release-card-row release-card-row--chapter release-card-row--empty">
              <div className="release-card-row-left">
                <Lock size={12} className="chapter-lock-icon" />
                <span className="chapter-number">No chapters</span>
              </div>
              <span className="chapter-badge is-time">Coming soon</span>
            </div>
          )}

          {/* Author Box (Green accent) */}
          {isSameAuthorArtist ? (
            <div className="release-card-row release-card-row--author">
              <span className="release-card-label">Author & Artist</span>
              <span className="release-card-value" title={author ?? undefined}>
                {author}
              </span>
            </div>
          ) : (
            <>
              <div className="release-card-row release-card-row--author">
                <span className="release-card-label">Author</span>
                <span className="release-card-value" title={author ?? 'N/A'}>
                  {author || 'N/A'}
                </span>
              </div>
              <div className="release-card-row release-card-row--artist">
                <span className="release-card-label">Artist</span>
                <span className="release-card-value" title={artist ?? 'N/A'}>
                  {artist || 'N/A'}
                </span>
              </div>
            </>
          )}

          {/* Sources Box (Red accent) */}
          <div className="release-card-row release-card-row--sources">
            <span className="release-card-label">Sources</span>
            <span className="release-card-value" title={sourcesValue}>
              {sourcesValue}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
