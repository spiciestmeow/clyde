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

export async function syncSeriesSources(
  title: string,
  alternateTitles: string[] = [],
): Promise<SyncSourcesResult> {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    throw new Error('Please enter a series title to search.');
  }

  const response = await fetch('/api/sync-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: cleanTitle,
      alternateTitles: alternateTitles.filter(Boolean),
    }),
  });

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
