import postgres from 'postgres';

export const DEFAULT_HEADER_VISIBILITY = {
  home: true,
  series: true,
  shop: true,
  community: true,
  search: true,
  bookmarks: true,
  notifications: true,
  theme: true,
  account: true,
  discord: true,
} as const;

export type HeaderVisibility = typeof DEFAULT_HEADER_VISIBILITY;

export interface SiteSettings {
  headerVisibility: HeaderVisibility;
  updatedAt: string | null;
}

export interface SeriesIssueReportInput {
  seriesSlug: string;
  seriesTitle: string;
  issueType: string;
  details: string;
  requesterHash: string | null;
}

let database: ReturnType<typeof postgres> | undefined;

function getDatabase(): ReturnType<typeof postgres> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured.');
  }

  database ??= postgres(connectionString, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return database;
}

export function parseHeaderVisibility(value: unknown): HeaderVisibility | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_HEADER_VISIBILITY) as (keyof HeaderVisibility)[];
  if (Object.keys(record).length !== keys.length) return null;
  if (keys.some((key) => typeof record[key] !== 'boolean')) return null;

  return Object.fromEntries(keys.map((key) => [key, record[key]])) as HeaderVisibility;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const sql = getDatabase();
  const rows = await sql`
    SELECT header_visibility, updated_at
    FROM site_settings
    WHERE id = 'global'
    LIMIT 1
  `;
  const row = rows[0] as
    | { header_visibility: unknown; updated_at: Date | string }
    | undefined;

  if (!row) {
    return { headerVisibility: DEFAULT_HEADER_VISIBILITY, updatedAt: null };
  }

  const headerVisibility = parseHeaderVisibility(row.header_visibility);
  if (!headerVisibility) {
    throw new Error('Stored header visibility has an invalid format.');
  }

  return {
    headerVisibility,
    updatedAt: row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : new Date(row.updated_at).toISOString(),
  };
}

export async function saveSiteSettings(
  headerVisibility: HeaderVisibility,
): Promise<SiteSettings> {
  const sql = getDatabase();
  await sql`
    INSERT INTO site_settings (id, header_visibility, updated_at)
    VALUES ('global', ${sql.json(headerVisibility)}, NOW())
    ON CONFLICT (id) DO UPDATE
      SET header_visibility = EXCLUDED.header_visibility,
          updated_at = NOW()
  `;

  return getSiteSettings();
}

export async function createSeriesIssueReport(input: SeriesIssueReportInput): Promise<void> {
  const sql = getDatabase();

  if (input.requesterHash) {
    const rows = await sql`
      SELECT COUNT(*)::int AS report_count
      FROM public.series_issue_reports
      WHERE requester_hash = ${input.requesterHash}
        AND created_at > NOW() - INTERVAL '10 minutes'
    `;
    if (Number(rows[0]?.report_count ?? 0) >= 5) {
      throw new Error('SERIES_REPORT_RATE_LIMIT');
    }
  }

  await sql`
    INSERT INTO public.series_issue_reports
      (series_slug, series_title, issue_type, details, requester_hash)
    VALUES
      (${input.seriesSlug}, ${input.seriesTitle}, ${input.issueType}, ${input.details}, ${input.requesterHash})
  `;
}

