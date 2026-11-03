export type ChapterSource = {
  name?: string;
  url?: string;
  latestChapterNumber?: string;
  latestChapterAt?: string;
};

function chapterNumber(value?: string): number {
  const parsed = Number.parseFloat(String(value || '').replace(/^ch(?:apter)?\.?\s*/i, ''));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function parseRelativeAgeMinutes(value?: string): number | null {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  if (['just now', 'new'].includes(raw)) return 0;
  if (raw === 'today') return 12 * 60;
  if (raw === 'yesterday') return 24 * 60;

  const match = raw.match(
    /^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks|mo|month|months)(?:\s*ago)?$/i,
  );
  if (match) {
    const count = Number.parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    if (unit.startsWith('m') && !unit.startsWith('mo')) return count;
    if (unit.startsWith('h')) return count * 60;
    if (unit.startsWith('d')) return count * 24 * 60;
    if (unit.startsWith('w')) return count * 7 * 24 * 60;
    if (unit.startsWith('mo')) return count * 30 * 24 * 60;
  }
  return null;
}

function releaseTimestamp(value?: string): number {
  if (!value) return Number.NaN;
  const raw = String(value).trim();
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;
  const ageMinutes = parseRelativeAgeMinutes(raw);
  if (ageMinutes !== null) return Date.now() - ageMinutes * 60 * 1000;
  return Number.NaN;
}

/**
 * Resolve the single source that should represent a series' latest release:
 * highest chapter first, then the most recent posting time for that chapter.
 */
export function getWinningChapterSource<T extends ChapterSource>(
  sources: readonly T[] | null | undefined,
  preferredUrl?: string,
): T | undefined {
  return [...(sources || [])]
    .filter((source) => chapterNumber(source.latestChapterNumber) !== Number.NEGATIVE_INFINITY)
    .sort((a, b) => {
      const chapterDifference = chapterNumber(b.latestChapterNumber) - chapterNumber(a.latestChapterNumber);
      if (chapterDifference !== 0) return chapterDifference;

      const aTimestamp = releaseTimestamp(a.latestChapterAt);
      const bTimestamp = releaseTimestamp(b.latestChapterAt);
      const aHasTime = !Number.isNaN(aTimestamp);
      const bHasTime = !Number.isNaN(bTimestamp);

      if (aHasTime && bHasTime) {
        if (aTimestamp !== bTimestamp) return bTimestamp - aTimestamp; // Most recent release wins
      } else if (aHasTime !== bHasTime) {
        return aHasTime ? -1 : 1;
      }

      const normalizedPreferredUrl = preferredUrl?.trim();
      const aIsPreferred = Boolean(normalizedPreferredUrl && a.url?.trim() === normalizedPreferredUrl);
      const bIsPreferred = Boolean(normalizedPreferredUrl && b.url?.trim() === normalizedPreferredUrl);
      if (aIsPreferred !== bIsPreferred) {
        return bIsPreferred ? 1 : -1;
      }

      return 0;
    })[0];
}
