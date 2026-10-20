import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { fetchScanlationSources } from './sync-sources.js';
import { scrapeDirectSources } from './sync-direct-sources.js';

interface ApiRequest extends IncomingMessage {
  query?: Record<string, string>;
  body?: unknown;
}

interface ApiResponse extends ServerResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://iaxnqgjcglhsdnikazxc.supabase.co';

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlheG5xZ2pjZ2xoc2RuaWthenhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNDU3MTAsImV4cCI6MjEwNzkyMTcxMH0.vkRAjHvs5v8NG9BiCV_pH1eRQhEXLfhfePUETlL_w40';

export default async function handler(
  request: ApiRequest,
  response: ApiResponse,
): Promise<void> {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    response.status(204).json({});
    return;
  }

  // Verify CRON_SECRET if configured in Vercel project
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      // Also allow test query param for manual testing ?secret=...
      const url = new URL(request.url || '', 'http://localhost');
      if (url.searchParams.get('secret') !== cronSecret) {
        response.status(401).json({ error: 'Unauthorized: Invalid CRON_SECRET' });
        return;
      }
    }
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    // 1. Fetch all series from catalog
    const { data: seriesList, error: fetchError } = await supabase
      .from('series')
      .select('id, slug, title, chapters, facts, sources, alternate_titles')
      .order('id', { ascending: true });

    if (fetchError || !seriesList) {
      throw new Error(fetchError?.message || 'Failed to fetch series catalog from Supabase.');
    }

    const updatedSeries: {
      id: number;
      title: string;
      previousChapter: string;
      newChapter: string;
      releaseTime: string;
      source: string;
    }[] = [];

    const logs: string[] = [];

    // 2. Iterate through each series and check both MangaUpdates and direct sources
    for (const item of seriesList) {
      try {
        const altTitles = Array.isArray(item.alternate_titles) ? item.alternate_titles : [];
        const syncResult = await fetchScanlationSources(item.title, altTitles);

        let detectedChNum = 0;
        let detectedChStr = '';
        let detectedTimestamp: number | undefined;
        let detectionSource = 'MangaUpdates';

        if (syncResult.matchedSeries?.latestChapterNumber) {
          const num = parseFloat(syncResult.matchedSeries.latestChapterNumber);
          if (!Number.isNaN(num)) {
            detectedChNum = num;
            detectedChStr = syncResult.matchedSeries.latestChapterNumber;
            detectedTimestamp = syncResult.matchedSeries.lastReleaseTimestamp;
          }
        }

        // Also check any custom / manually added source URLs on the series
        const itemSources = Array.isArray(item.sources) ? item.sources : [];
        if (itemSources.length > 0) {
          const directResult = await scrapeDirectSources(itemSources, item.title);
          if (directResult.success && directResult.highestChapter) {
            const directNum = parseFloat(directResult.highestChapter);
            if (!Number.isNaN(directNum) && directNum > detectedChNum) {
              detectedChNum = directNum;
              detectedChStr = directResult.highestChapter;
              detectedTimestamp = Date.now();
              detectionSource = `Direct Source (${directResult.sourceName})`;
            }
          }
        }

        if (detectedChNum === 0) {
          logs.push(`[${item.title}] No release data found on MangaUpdates or direct sources`);
          continue;
        }

        // Current chapter number
        const currentChStr =
          item.facts?.latest_chapter_number ||
          (item.chapters?.[0]?.title ? String(item.chapters[0].title).replace(/^[^\d.]*/, '') : '0');
        const currentNum = parseFloat(currentChStr) || 0;

        // If newly detected chapter is higher than current
        if (detectedChNum > currentNum) {
          const newChTitle = `Chapter ${detectedChStr}`;
          const newChHref = `/series/${item.slug}/chapter-${detectedChStr}`;
          const releaseIso = detectedTimestamp
            ? new Date(detectedTimestamp).toISOString()
            : new Date().toISOString();

          const existingChapters = Array.isArray(item.chapters) ? item.chapters : [];
          const alreadyHasCh = existingChapters.some((ch: any) => {
            const t = String(ch?.title || '').trim().toLowerCase();
            return t === newChTitle.toLowerCase() || t === String(detectedChStr);
          });

          const nextChapters = alreadyHasCh
            ? existingChapters
            : [
                {
                  title: newChTitle,
                  href: newChHref,
                  status: 'New',
                  locked: false,
                  createdAt: releaseIso,
                },
                ...existingChapters,
              ];

          const nextFacts = {
            ...(item.facts || {}),
            latest_chapter_number: String(detectedChStr),
            last_chapter_added_at: releaseIso,
            lastUpdate: releaseIso,
          };

          const { error: updateError } = await supabase
            .from('series')
            .update({
              chapters: nextChapters,
              facts: nextFacts,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          if (updateError) {
            logs.push(`[${item.title}] Failed to update Supabase: ${updateError.message}`);
          } else {
            updatedSeries.push({
              id: item.id,
              title: item.title,
              previousChapter: String(currentNum),
              newChapter: String(detectedChNum),
              releaseTime: releaseIso,
              source: detectionSource,
            });
            logs.push(`[${item.title}] Updated: Ch.${currentNum} -> Ch.${detectedChNum} (via ${detectionSource})`);
          }
        } else {
          logs.push(`[${item.title}] Up-to-date (Current: ${currentNum}, Detected: ${detectedChNum} via ${detectionSource})`);
        }
      } catch (seriesErr) {
        const msg = seriesErr instanceof Error ? seriesErr.message : String(seriesErr);
        logs.push(`[${item.title}] Error during check: ${msg}`);
      }
    }

    response.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      totalSeriesChecked: seriesList.length,
      seriesUpdatedCount: updatedSeries.length,
      updatedSeries,
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cron sync failed.';
    response.status(500).json({ success: false, error: message });
  }
}
