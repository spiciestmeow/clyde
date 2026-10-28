import {
  getSeriesCreatedTimestamp,
  getSeriesReleaseAgeMinutes,
  getSeriesReleaseTimestamp,
  type SeriesRecord,
} from './seriesCatalog';

export function sortLatestReleases(seriesItems: SeriesRecord[]) {
  return [...seriesItems].sort((left, right) => {
    const rightTime = getSeriesReleaseTimestamp(right);
    const leftTime = getSeriesReleaseTimestamp(left);
    if (rightTime !== leftTime) return rightTime - leftTime;

    const rightCreated = getSeriesCreatedTimestamp(right);
    const leftCreated = getSeriesCreatedTimestamp(left);
    if (rightCreated !== leftCreated) return rightCreated - leftCreated;

    return left.pageNumber - right.pageNumber
      || left.pageOrder - right.pageOrder
      || left.title.localeCompare(right.title);
  });
}

export function getNewSeriesReleases(seriesItems: SeriesRecord[], configuredOrder: string[] = []) {
  const filtered = seriesItems.filter((release) => {
    if (release.isNew || release.facts?.is_new === 'true') return true;
    if (release.facts?.is_new === 'false') return false;

    const hasNewChapter = release.chapters.some((chapter) => {
      const status = chapter.status.trim().toLowerCase();
      return status === 'new' || status === 'just now' || status.includes('min') || status.includes('hour') || status === 'today';
    });
    return hasNewChapter || getSeriesReleaseAgeMinutes(release) <= 7 * 1440;
  });

  return filtered.sort((left, right) => {
    if (configuredOrder.length > 0) {
      const leftTagged = Boolean(left.isNew || left.facts?.is_new === 'true');
      const rightTagged = Boolean(right.isNew || right.facts?.is_new === 'true');
      if (leftTagged !== rightTagged) return leftTagged ? -1 : 1;

      if (leftTagged && rightTagged) {
        const leftRank = configuredOrder.indexOf(String(left.id));
        const rightRank = configuredOrder.indexOf(String(right.id));
        if (leftRank !== rightRank) {
          if (leftRank === -1) return -1;
          if (rightRank === -1) return 1;
          return leftRank - rightRank;
        }
      }
    }

    const rightCreated = getSeriesCreatedTimestamp(right);
    const leftCreated = getSeriesCreatedTimestamp(left);
    return rightCreated - leftCreated || (right.id || 0) - (left.id || 0);
  });
}
