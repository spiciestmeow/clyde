export type DetectedSource = {
  name: string;
  url: string;
  logo?: string;
  chapterCount?: string;
  active: boolean;
  type: 'scanlator' | 'official';
};

export type SyncSourcesResult = {
  matchedSeries: {
    id: number;
    title: string;
    year?: string;
    status?: string;
    totalChapters?: string;
    latestChapterNumber?: string;
    lastReleaseTimestamp?: number;
    url?: string;
    image?: string;
  } | null;
  sources: DetectedSource[];
};

export async function syncSeriesSources(title: string): Promise<SyncSourcesResult> {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    throw new Error('Please enter a series title to search.');
  }

  const endpoint = `/api/sync-sources?title=${encodeURIComponent(cleanTitle)}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    let errorMessage = `Failed to sync sources (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMessage = errJson.error;
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
