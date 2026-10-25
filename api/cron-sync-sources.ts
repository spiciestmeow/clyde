import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { fetchScanlationSources } from './sync-sources.js';
import { scrapeDirectSources } from './sync-direct-sources.js';

// Configure Vercel serverless function max execution time (up to 60s)
export const maxDuration = 60;

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

  const startTime = Date.now();
  // Safe deadline budget: 22s ensures we always reply before cron-job.org's 25-30s timeout
  const TIME_BUDGET_MS = 22000;

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

    type SeriesRecord = NonNullable<typeof seriesList>[number];

    const updatedSeries: {
      id: number;
      title: string;
      previousChapter: string;
      newChapter: string;
      releaseTime: string;
      source: string;
    }[] = [];

    const logs: string[] = [];
    let checkedCount = 0;

    // Helper to check and sync a single series
    async function checkSeries(item: SeriesRecord) {
      try {
        // `null` means no release was detected; chapter zero is valid data.
        let detectedChNum: number | null = null;
        let detectedChStr = '';
        let detectedTimestamp: number | undefined;
        let detectionSource = '';
        let latestDirectSourceName = '';
        let latestDirectSourceUrl = '';
        let refreshedSources = Array.isArray(item.sources) ? item.sources : [];
        let hasSourceStatsChange = false;
        const itemSources = Array.isArray(item.sources)
          ? item.sources.filter((source: any) => typeof source?.url === 'string' && source.url.trim())
          : [];

        // Configured links are series-specific, so use them as the source of
        // truth. MangaUpdates is only a fallback when no direct URLs are saved.
        if (itemSources.length > 0) {
          const directResult = await scrapeDirectSources(itemSources, item.title);
          const directNum = parseFloat(directResult.highestChapter);
          if (!directResult.success || !directResult.highestChapter || Number.isNaN(directNum) || directNum < 0) {
            logs.push(
              `[${item.title}] Direct source URLs are configured, but no chapter data could be read. MangaUpdates fallback skipped${directResult.message ? `: ${directResult.message}` : '.'}`,
            );
            return;
          }

          detectedChNum = directNum;
          detectedChStr = directResult.highestChapter;
          const latestMs = directResult.latestReleaseAt
            ? Date.parse(directResult.latestReleaseAt)
            : NaN;
          detectedTimestamp = !Number.isNaN(latestMs) ? latestMs : undefined;
          detectionSource = `Direct Source (${directResult.latestReleaseName || directResult.sourceName})`;
          latestDirectSourceName = directResult.sourceName;
          latestDirectSourceUrl = directResult.sourceUrl;
          const sourceResultsByUrl = new Map(directResult.sourceResults.map((source) => [source.url.trim(), source]));
          refreshedSources = (Array.isArray(item.sources) ? item.sources : []).map((source: any) => {
            const scanResult = sourceResultsByUrl.get(typeof source?.url === 'string' ? source.url.trim() : '');
            if (!scanResult) return source;
            const isWinningSource = typeof source?.url === 'string' && source.url.trim() === latestDirectSourceUrl.trim();
            const winningReleaseAt = detectedTimestamp
              ? new Date(detectedTimestamp).toISOString()
              : scanResult.latestChapterAt;
            return {
              ...source,
              latestChapterNumber: scanResult.latestChapterNumber,
              // A successful scrape with no date means the date is unknown;
              // never keep an old timestamp that may reflect the sync time.
              // Keep the winning source aligned with the canonical timestamp
              // used for the series-level release date.
              latestChapterAt: isWinningSource ? winningReleaseAt : scanResult.latestChapterAt,
            };
          });
          hasSourceStatsChange = JSON.stringify(refreshedSources) !== JSON.stringify(item.sources || []);
        } else {
          const altTitles = Array.isArray(item.alternate_titles) ? item.alternate_titles : [];
          const syncResult = await fetchScanlationSources(item.title, altTitles);
          const mangaUpdatesChapter = syncResult.matchedSeries?.latestChapterNumber;
          if (mangaUpdatesChapter) {
            const num = parseFloat(mangaUpdatesChapter);
            if (!Number.isNaN(num) && num > 0) {
              detectedChNum = num;
              detectedChStr = mangaUpdatesChapter;
              detectedTimestamp = syncResult.matchedSeries?.lastReleaseTimestamp;
              detectionSource = 'MangaUpdates';
            }
          }
        }

        if (detectedChNum === null) {
          logs.push(`[${item.title}] No release data found on ${detectionSource || 'available sources'}`);
          return;
        }

        // Current chapter number
        const currentChStr =
          item.facts?.latest_chapter_number ||
          (item.chapters?.[0]?.title ? String(item.chapters[0].title).replace(/^[^\d.]*/, '') : '');
        const parsedCurrentNum = currentChStr ? parseFloat(currentChStr) : Number.NaN;
        const currentNum = Number.isFinite(parsedCurrentNum) ? parsedCurrentNum : null;

        // Only advance the catalog automatically. Lower direct-source results
        // are reported as mismatches for review rather than rolling data back.
        if (currentNum === null || detectedChNum > currentNum) {
          const newChTitle = `Chapter ${detectedChStr}`;
          const newChHref = `/series/${item.slug}/chapter-${detectedChStr}`;
          const releaseIso = detectedTimestamp
            ? new Date(detectedTimestamp).toISOString()
            : undefined;

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
                  ...(releaseIso ? { createdAt: releaseIso } : {}),
                },
                ...existingChapters,
              ];

          const nextFacts = {
            ...(item.facts || {}),
            latest_chapter_number: String(detectedChStr),
            ...(latestDirectSourceUrl ? {
              latest_source_name: latestDirectSourceName,
              latest_source_url: latestDirectSourceUrl,
            } : {}),
            ...(releaseIso ? {
              last_chapter_added_at: releaseIso,
              lastUpdate: releaseIso,
            } : {}),
          };

          const { error: updateError } = await supabase
            .from('series')
            .update({
              chapters: nextChapters,
              sources: refreshedSources,
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
              previousChapter: String(currentNum ?? 0),
              newChapter: String(detectedChNum),
              releaseTime: releaseIso,
              source: detectionSource,
            });
            logs.push(`[${item.title}] Updated: Ch.${currentNum ?? 'none'} -> Ch.${detectedChNum} (via ${detectionSource})`);
          }
        } else if (detectedChNum < currentNum) {
          const hasNewTopSource = Boolean(
            latestDirectSourceUrl &&
            (item.facts?.latest_source_url !== latestDirectSourceUrl || item.facts?.latest_source_name !== latestDirectSourceName),
          );
          if (hasSourceStatsChange || hasNewTopSource) {
            const { error: sourceUpdateError } = await supabase
              .from('series')
              .update({
                ...(hasSourceStatsChange ? { sources: refreshedSources } : {}),
                facts: {
                  ...(item.facts || {}),
                  ...(latestDirectSourceUrl ? {
                    latest_source_name: latestDirectSourceName,
                    latest_source_url: latestDirectSourceUrl,
                  } : {}),
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);
            if (sourceUpdateError) {
              logs.push(`[${item.title}] Could not refresh per-source chapter data: ${sourceUpdateError.message}`);
            }
          }
          logs.push(
            `[${item.title}] Mismatch: catalog says Ch.${currentNum}, but ${detectionSource} detects Ch.${detectedChNum}. Catalog was not changed; review the saved chapter data.`,
          );
        } else {
          // A series can already have the correct chapter number while its
          // saved release time or winning source is stale. The direct scraper
          // chooses the canonical (earliest reported) posting time for that
          // chapter, so accept a different timestamp in either direction.
          const currentUpdateValue = item.facts?.last_chapter_added_at || item.facts?.lastUpdate;
          const currentUpdateMs = currentUpdateValue ? Date.parse(String(currentUpdateValue)) : NaN;
          const hasDifferentReleaseTime = Boolean(
            detectedTimestamp &&
            (Number.isNaN(currentUpdateMs) || detectedTimestamp !== currentUpdateMs),
          );
          const hasNewTopSource = Boolean(
            latestDirectSourceUrl &&
            (item.facts?.latest_source_url !== latestDirectSourceUrl || item.facts?.latest_source_name !== latestDirectSourceName),
          );
          if (detectionSource.startsWith('Direct Source (') && (hasDifferentReleaseTime || hasNewTopSource || hasSourceStatsChange)) {
            const releaseIso = hasDifferentReleaseTime && detectedTimestamp
              ? new Date(detectedTimestamp).toISOString()
              : undefined;
            const { error: updateError } = await supabase
              .from('series')
              .update({
                ...(hasSourceStatsChange ? { sources: refreshedSources } : {}),
                facts: {
                  ...(item.facts || {}),
                  ...(latestDirectSourceUrl ? {
                    latest_source_name: latestDirectSourceName,
                    latest_source_url: latestDirectSourceUrl,
                  } : {}),
                  ...(releaseIso ? {
                    last_chapter_added_at: releaseIso,
                    lastUpdate: releaseIso,
                  } : {}),
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);

            if (updateError) {
              logs.push(`[${item.title}] Chapter ${currentNum} is up-to-date, but source metadata refresh failed: ${updateError.message}`);
            } else {
              const refreshed = [
                hasDifferentReleaseTime ? 'release time' : '',
                hasNewTopSource ? 'top source' : '',
                hasSourceStatsChange ? 'per-source chapter data' : '',
              ].filter(Boolean).join(' and ');
              const releaseDetail = releaseIso ? ` to ${releaseIso}` : '';
              logs.push(`[${item.title}] Chapter ${currentNum} is up-to-date; refreshed ${refreshed}${releaseDetail}.`);
            }
          } else {
            logs.push(`[${item.title}] Up-to-date (Current: ${currentNum}, Detected: ${detectedChNum} via ${detectionSource})`);
          }
        }
      } catch (seriesErr) {
        const msg = seriesErr instanceof Error ? seriesErr.message : String(seriesErr);
        logs.push(`[${item.title}] Error during check: ${msg}`);
      }
    }

    // 2. Process series concurrently (5 parallel workers)
    const CONCURRENCY = 5;
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(CONCURRENCY, seriesList.length) }, async () => {
      while (nextIndex < seriesList.length) {
        // Enforce safety deadline so the function never times out
        if (Date.now() - startTime >= TIME_BUDGET_MS) {
          break;
        }
        const item = seriesList[nextIndex++];
        checkedCount++;
        await checkSeries(item);
      }
    });

    await Promise.all(workers);

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);

    // 3. Persist latest sync execution log to site_settings so Admin UI can show real history
    try {
      const { data: currentSettings } = await supabase
        .from('site_settings')
        .select('header_visibility')
        .eq('id', 'global')
        .maybeSingle();

      const currentHeader = (currentSettings?.header_visibility as any) || {};
      const existingLogs = Array.isArray(currentHeader.sync_logs) ? currentHeader.sync_logs : [];

      // Keep logs compact to prevent inflating site_settings and exhausting egress/bandwidth
      const relevantLogs = logs
        .filter((l) => l.includes('Updated:') || l.includes('Error') || l.includes('Failed') || l.includes('Direct source URLs are configured'))
        .slice(0, 8);

      const fallbackLogs = relevantLogs.length > 0 ? relevantLogs : logs.slice(0, 3);

      const newLogEntry = {
        id: String(Date.now()),
        timestamp: new Date().toISOString(),
        totalChecked: checkedCount,
        updatedCount: updatedSeries.length,
        updatedSeries: updatedSeries.map((u) => ({
          title: u.title,
          previousChapter: u.previousChapter,
          newChapter: u.newChapter,
          source: u.source,
          time: u.releaseTime,
        })),
        logs: fallbackLogs,
      };

      // Keep only the 5 most recent logs to avoid database bloat
      const nextLogs = [newLogEntry, ...existingLogs].slice(0, 5);

      await supabase
        .from('site_settings')
        .update({
          header_visibility: {
            ...currentHeader,
            sync_logs: nextLogs,
          },
        })
        .eq('id', 'global');
    } catch (logErr) {
      console.warn('Could not persist sync log to site_settings:', logErr);
    }

    response.status(200).json({
      success: true,
      duration: `${elapsedSeconds}s`,
      totalCatalogCount: seriesList.length,
      totalSeriesChecked: checkedCount,
      seriesUpdatedCount: updatedSeries.length,
      updatedSeries,
      logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cron sync failed.';
    response.status(500).json({ success: false, error: message });
  }
}
