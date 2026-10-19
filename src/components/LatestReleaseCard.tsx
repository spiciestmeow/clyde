import { Eye, Pin, Star } from 'lucide-react';
import type { SeriesRecord } from '../lib/seriesCatalog';

export type LatestRelease = {
  id?: number;
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
  views?: number | null;
  facts?: Record<string, string | null> | null;
};

/** Convert a SeriesRecord directly into the LatestRelease shape */
export function seriesToRelease(item: SeriesRecord): LatestRelease {
  return {
    id: item.id,
    title: item.title,
    href: item.href,
    cover: item.cover,
    category: item.category,
    rating: item.rating,
    status: item.status,
    pinned: item.pinned,
    chapters: item.chapters,
    author: item.author,
    artist: item.artist,
    sources: item.sources,
    publishers: item.publishers,
    favorites: item.favorites,
    views: item.views,
    facts: item.facts,
  };
}

type LatestReleaseCardProps = {
  release: LatestRelease;
  imageSrc: string;
};

function cleanCredit(val?: string | null): string {
  if (!val) return 'value';
  const trimmed = val.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined' ||
    trimmed.toLowerCase() === 'none'
  ) {
    return 'value';
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
  return 'value';
}

function formatViews(release: LatestRelease): string {
  if (typeof release.views === 'number' && release.views > 0) {
    const v = release.views;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return String(v);
  }
  if (release.favorites) {
    const fav = release.favorites;
    if (typeof fav === 'number') {
      return fav >= 1000 ? `${(fav / 1000).toFixed(1)}k` : String(fav);
    }
    const parsed = parseFloat(fav);
    if (!Number.isNaN(parsed) && !fav.includes('k') && !fav.includes('M')) {
      return parsed >= 1000 ? `${(parsed / 1000).toFixed(1)}k` : fav;
    }
    return fav;
  }
  return typeof release.views === 'number' ? String(release.views) : '0';
}

export function LatestReleaseCard({
  release,
  imageSrc,
}: LatestReleaseCardProps) {
  const author = cleanCredit(release.author);
  const artist = cleanCredit(release.artist);
  const isSameAuthorArtist =
    author !== 'value' &&
    artist !== 'value' &&
    author.toLowerCase() === artist.toLowerCase();

  const sourcesValue = getSourcesDisplay(release);
  const viewsValue = formatViews(release);

  const latestChapter = release.chapters[0];

  return (
    <article className="release-card">
      <a className="release-cover" href={release.href} title={release.title}>
        <img src={imageSrc} alt={release.title} loading="lazy" />
        <span className="release-type">{release.category || 'Manhwa'}</span>
        {release.pinned ? (
          <span className="release-cover-pill is-pinned">
            <Pin size={11} className="pin-icon" fill="currentColor" />
            <span>Pinned</span>
          </span>
        ) : (
          <span className="release-cover-pill is-views">
            <Eye size={12} />
            <span>{viewsValue}</span>
          </span>
        )}
      </a>

      <div className="release-info">
        <a className="release-title" href={release.href} title={release.title}>
          {release.title}
        </a>

        <div className="release-meta">
          <div className="release-rating">
            <span className="release-rating-num">{release.rating ?? '9.16'}</span>
            <Star size={14} fill="#f59e0b" color="#f59e0b" />
          </div>
          <div className="release-status">
            <i />
            <span>{release.status || 'Ongoing'}</span>
          </div>
        </div>

        <div className="release-boxes">
          {/* Chapter Box (Amber accent) */}
          {latestChapter ? (
            <a className="release-box release-box--chapter" href={latestChapter.href}>
              <div className="release-box-left">
                <span className="chapter-title">{latestChapter.title}</span>
              </div>
              <div className="release-box-right">
                {latestChapter.status.trim().toLowerCase() === 'free now' ? (
                  <span className="chapter-badge is-free">
                    Free now
                  </span>
                ) : latestChapter.status.trim().toLowerCase() === 'new' ? (
                  <span className="chapter-badge is-new">
                    <span className="pumpkin-icon">🎃</span> New
                  </span>
                ) : (
                  <span className="chapter-badge is-time">
                    {latestChapter.status}
                  </span>
                )}
              </div>
            </a>
          ) : (
            <div className="release-box release-box--chapter is-empty">
              <div className="release-box-left">
                <span className="chapter-title">Chapter 13</span>
              </div>
              <div className="release-box-right">
                <span className="chapter-badge is-new">
                  <span className="pumpkin-icon">🎃</span> New
                </span>
              </div>
            </div>
          )}

          {/* Author Box (Green accent) */}
          {isSameAuthorArtist ? (
            <div className="release-box release-box--author">
              <span className="release-box-label">Author & Artist</span>
              <span className="release-box-value" title={author}>{author}</span>
            </div>
          ) : (
            <>
              <div className="release-box release-box--author">
                <span className="release-box-label">Author</span>
                <span className="release-box-value" title={author}>{author}</span>
              </div>

              {/* Artist Box (Purple accent) */}
              <div className="release-box release-box--artist">
                <span className="release-box-label">Artist</span>
                <span className="release-box-value" title={artist}>{artist}</span>
              </div>
            </>
          )}

          {/* Sources Box (Red accent) */}
          <div className="release-box release-box--sources">
            <span className="release-box-label">Sources</span>
            <span className="release-box-value" title={sourcesValue}>{sourcesValue}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
