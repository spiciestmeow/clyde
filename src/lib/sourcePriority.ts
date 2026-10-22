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

function releaseTimestamp(value?: string): number {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Resolve the single source that should represent a series' latest release:
 * highest chapter first, then the earliest known posting time for that chapter.
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
      if (Number.isNaN(aTimestamp) !== Number.isNaN(bTimestamp)) return Number.isNaN(aTimestamp) ? 1 : -1;
      if (!Number.isNaN(aTimestamp) && aTimestamp !== bTimestamp) return aTimestamp - bTimestamp;

      const normalizedPreferredUrl = preferredUrl?.trim();
      return Number(b.url?.trim() === normalizedPreferredUrl) - Number(a.url?.trim() === normalizedPreferredUrl);
    })[0];
}
