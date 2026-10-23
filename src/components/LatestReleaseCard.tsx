import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Eye, Pin, Star } from 'lucide-react';
import type { SeriesRecord } from '../lib/seriesCatalog';
import { formatScanlatorSeriesUrl } from '../lib/scanlatorLinks';
import { getWinningChapterSource } from '../lib/sourcePriority';

function MarqueeValue({ text, forceStatic = false }: { text: string; forceStatic?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [duration, setDuration] = useState(8);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const checkOverflow = () => {
      const textWidth = measure.offsetWidth;
      const containerWidth = container.clientWidth;
      const overflows = textWidth > containerWidth;
      setIsOverflowing(overflows);
      if (overflows) {
        // Steady scroll speed (~35px/s, min 6s)
        const calculatedDuration = Math.max(6, Math.round((textWidth + 28) / 35));
        setDuration(calculatedDuration);
      }
    };

    checkOverflow();

    const ro = new ResizeObserver(() => {
      checkOverflow();
    });
    ro.observe(container);

    if (document.fonts?.ready) {
      void document.fonts.ready.then(checkOverflow);
    }

    return () => ro.disconnect();
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={`release-box-value${isOverflowing && !forceStatic ? ' is-overflowing' : ''}`}
      title={text}
    >
      <span ref={measureRef} className="release-box-value-measure" aria-hidden="true">
        {text}
      </span>
      {isOverflowing && !forceStatic ? (
        <div
          className="release-box-marquee-track"
          style={{ animationDuration: `${duration}s` }}
        >
          <span className="release-box-marquee-unit">{text}</span>
          <span className="release-box-marquee-unit" aria-hidden="true">{text}</span>
        </div>
      ) : (
        <span className="release-box-value-static">{text}</span>
      )}
    </div>
  );
}

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
  sources?: { name: string; url: string; latestChapterNumber?: string; latestChapterAt?: string }[] | null;
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
  variant?: 'default' | 'series';
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
    const names = release.sources.map((s) => s.name?.trim()).filter(Boolean);
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
  const firstSource = release.facts?.first_source || release.facts?.firstSource;
  if (firstSource) {
    return firstSource;
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

function formatReleaseTime(release: LatestRelease): string | null {
  const latestChapter = release.chapters[0];
  const winningSource = getWinningChapterSource(release.sources, release.facts?.latest_source_url || undefined);
  const sourceDate = winningSource?.latestChapterAt;
  const factDate = release.facts?.last_chapter_added_at || release.facts?.lastUpdate || release.facts?.['Last update'];

  let timestamp = 0;
  if (winningSource && !sourceDate) return 'Time unavailable';
  const preferredDate = winningSource ? sourceDate : factDate;
  if (preferredDate) {
    const parsed = Date.parse(preferredDate);
    if (!Number.isNaN(parsed)) {
      timestamp = parsed;
    }
  }

  if (!timestamp && latestChapter?.status) {
    const s = latestChapter.status.trim().toLowerCase();
    if (s === 'new' || s === 'just now') return 'Just now';
    if (s === 'today') return 'Today';
    if (s === 'yesterday') return 'Yesterday';
    if (/^\d+\s*(?:m|min|h|hr|hour|d|day|w|week|mo|month)s?(?:\s*ago)?$/i.test(s)) {
      return s.includes('ago') ? s : `${s} ago`;
    }
    const parsed = Date.parse(latestChapter.status);
    if (!Number.isNaN(parsed)) {
      timestamp = parsed;
    }
  }

  if (timestamp > 0) {
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 5) return `${diffWeeks}w ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    const diffYears = Math.floor(diffDays / 365);
    if (diffYears < 1) return `${diffMonths}mo ago`;
    return `${diffYears}y ago`;
  }

  return null;
}

export function LatestReleaseCard({
  release,
  imageSrc,
  variant = 'default',
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
  const winningSource = getWinningChapterSource(release.sources, release.facts?.latest_source_url || undefined);
  const preferredSourceUrl = winningSource?.url?.trim() || release.facts?.latest_source_url?.trim();
  const prioritizedSources = preferredSourceUrl
    ? [...(release.sources || [])].sort(
        (a, b) => Number(b.url.trim() === preferredSourceUrl) - Number(a.url.trim() === preferredSourceUrl),
      )
    : release.sources || [];
  const firstSource = prioritizedSources.find((source) => source.url.trim());
  const chapterTarget = firstSource
    ? formatScanlatorSeriesUrl(firstSource.name, firstSource.url, release.title)
    : latestChapter?.href;
  const relativeTime = formatReleaseTime(release);
  const categoryLabel = release.category?.trim() || 'Manhwa';

  return (
    <article className={`release-card${variant === 'series' ? ' release-card--series' : ''}`}>
      <Link className="release-cover" href={release.href} title={release.title}>
        <img src={imageSrc} alt={release.title} loading="lazy" />
        <span className="release-type" data-category={categoryLabel.toLowerCase()}>
          {categoryLabel}
        </span>
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
      </Link>

      <div className="release-info">
        <Link className="release-title" href={release.href} title={release.title}>
          {release.title}
        </Link>

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
            <a className="release-box release-box--chapter" href={chapterTarget || latestChapter.href} target={firstSource ? '_blank' : undefined} rel={firstSource ? 'noopener noreferrer' : undefined}>
              <div className="release-box-left">
                <span className="chapter-title">{winningSource?.latestChapterNumber
                  ? `Chapter ${winningSource.latestChapterNumber.replace(/^ch(?:apter)?\.?\s*/i, '')}`
                  : latestChapter.title}</span>
              </div>
              <div className="release-box-right">
                {relativeTime ? (
                  <span className="chapter-badge is-time">
                    {relativeTime}
                  </span>
                ) : latestChapter.status.trim().toLowerCase() === 'free now' ? (
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
                <span className="chapter-title">
                  {winningSource?.latestChapterNumber
                    ? `Chapter ${winningSource.latestChapterNumber.replace(/^ch(?:apter)?\.?\s*/i, '')}`
                    : release.facts?.latest_chapter_number
                    ? `Chapter ${release.facts.latest_chapter_number.replace(/^ch(?:apter)?\.?\s*/i, '')}`
                    : 'Chapter 1'}
                </span>
              </div>
              <div className="release-box-right">
                {relativeTime ? (
                  <span className="chapter-badge is-time">
                    {relativeTime}
                  </span>
                ) : (
                  <span className="chapter-badge is-new">
                    <span className="pumpkin-icon">🎃</span> New
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Author/Artist boxes — only show if there's real data */}
          {(author !== 'value' || artist !== 'value') && (
            isSameAuthorArtist ? (
              <div className="release-box release-box--author">
                <span className="release-box-label">Author & Artist</span>
                <MarqueeValue text={author} />
              </div>
            ) : (
              <>
                {author !== 'value' && (
                  <div className="release-box release-box--author">
                    <span className="release-box-label">Author</span>
                    <MarqueeValue text={author} />
                  </div>
                )}

                {/* Artist Box (Purple accent) */}
                {artist !== 'value' && (
                  <div className="release-box release-box--artist">
                    <span className="release-box-label">Artist</span>
                    <MarqueeValue text={artist} />
                  </div>
                )}
              </>
            )
          )}

          {/* Sources Box (Red accent) */}
          <div className="release-box release-box--sources">
            <span className="release-box-label">Sources</span>
            <MarqueeValue text={sourcesValue} />
          </div>
        </div>
      </div>
    </article>
  );
}
