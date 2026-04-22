import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

let _sql: ReturnType<typeof neon> | null = null;
let _initPromise: Promise<void> | null = null;

export function getSql(): ReturnType<typeof neon> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local (see .env.example).",
    );
  }
  _sql = neon(url);
  return _sql;
}

// Idempotent table bootstrap. Runs once per process on first call.
async function ensureSchema(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const sql = getSql();
    await sql`
      CREATE TABLE IF NOT EXISTS audits (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        url_key TEXT NOT NULL,
        industry TEXT NOT NULL,
        city TEXT,
        auto_industry BOOLEAN DEFAULT FALSE,
        detection JSONB,
        scrape_meta JSONB NOT NULL,
        profile JSONB NOT NULL,
        queries JSONB NOT NULL,
        results JSONB NOT NULL,
        score JSONB NOT NULL,
        competitors JSONB NOT NULL,
        analysis TEXT,
        duration_ms INTEGER,
        client_ip_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS audits_url_key_created_idx ON audits (url_key, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS audits_industry_created_idx ON audits (industry, created_at DESC)`;
  })().catch((err) => {
    _initPromise = null;
    throw err;
  });
  return _initPromise;
}

export function normalizeUrlKey(u: string): string {
  try {
    const x = new URL(u);
    return (x.hostname + x.pathname)
      .replace(/^www\./i, "")
      .replace(/\/$/, "")
      .toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

function newAuditId(): string {
  return "aud_" + crypto.randomBytes(9).toString("base64url");
}

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export type AuditInsert = {
  url: string;
  industry: string;
  city: string | null;
  autoIndustry: boolean;
  detection: unknown;
  scrapeMeta: unknown;
  profile: unknown;
  queries: unknown;
  results: unknown;
  score: unknown;
  competitors: unknown;
  analysis: string;
  durationMs: number;
  clientIp: string;
};

export type AuditRow = {
  id: string;
  url: string;
  urlKey: string;
  industry: string;
  city: string | null;
  autoIndustry: boolean;
  detection: unknown;
  scrapeMeta: unknown;
  profile: unknown;
  queries: unknown;
  results: unknown;
  score: unknown;
  competitors: unknown;
  analysis: string;
  durationMs: number;
  createdAt: Date;
};

export async function saveAudit(input: AuditInsert): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const id = newAuditId();
  const urlKey = normalizeUrlKey(input.url);
  const clientIpHash = hashIp(input.clientIp);
  await sql`
    INSERT INTO audits (
      id, url, url_key, industry, city, auto_industry,
      detection, scrape_meta, profile, queries, results,
      score, competitors, analysis, duration_ms, client_ip_hash
    )
    VALUES (
      ${id}, ${input.url}, ${urlKey}, ${input.industry}, ${input.city ?? null},
      ${input.autoIndustry},
      ${JSON.stringify(input.detection)}::jsonb,
      ${JSON.stringify(input.scrapeMeta)}::jsonb,
      ${JSON.stringify(input.profile)}::jsonb,
      ${JSON.stringify(input.queries)}::jsonb,
      ${JSON.stringify(input.results)}::jsonb,
      ${JSON.stringify(input.score)}::jsonb,
      ${JSON.stringify(input.competitors)}::jsonb,
      ${input.analysis},
      ${input.durationMs},
      ${clientIpHash}
    )
  `;
  return id;
}

function rowToAudit(row: Record<string, unknown>): AuditRow {
  return {
    id: row.id as string,
    url: row.url as string,
    urlKey: row.url_key as string,
    industry: row.industry as string,
    city: (row.city as string | null) ?? null,
    autoIndustry: Boolean(row.auto_industry),
    detection: row.detection,
    scrapeMeta: row.scrape_meta,
    profile: row.profile,
    queries: row.queries,
    results: row.results,
    score: row.score,
    competitors: row.competitors,
    analysis: (row.analysis as string) ?? "",
    durationMs: (row.duration_ms as number) ?? 0,
    createdAt: new Date(row.created_at as string),
  };
}

export async function getAuditById(id: string): Promise<AuditRow | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM audits WHERE id = ${id} LIMIT 1
  `) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  return rowToAudit(rows[0]);
}

export async function getMostRecentAuditForUrl(
  url: string,
  withinHours: number,
): Promise<AuditRow | null> {
  await ensureSchema();
  const sql = getSql();
  const urlKey = normalizeUrlKey(url);
  const rows = (await sql`
    SELECT * FROM audits
    WHERE url_key = ${urlKey}
      AND created_at > NOW() - ${`${withinHours} hours`}::interval
    ORDER BY created_at DESC
    LIMIT 1
  `) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  return rowToAudit(rows[0]);
}

export type SimilarAudit = {
  id: string;
  url: string;
  profileName: string | null;
  overall: number;
  createdAt: Date;
};

export async function getSimilarAudits(
  industry: string,
  score: number,
  excludeUrlKey: string,
  limit: number = 5,
): Promise<SimilarAudit[]> {
  await ensureSchema();
  const sql = getSql();
  // Rank by score-distance to the given score, ascending, within the same
  // industry, excluding the same URL. Only real audits (not mock seed rows
  // with empty queries arrays).
  const rows = (await sql`
    SELECT
      id,
      url,
      profile->>'name' AS profile_name,
      (score->>'overall')::int AS overall,
      created_at
    FROM audits
    WHERE industry = ${industry}
      AND url_key <> ${excludeUrlKey}
      AND jsonb_array_length(queries) > 0
    ORDER BY ABS((score->>'overall')::int - ${score}) ASC, created_at DESC
    LIMIT ${limit}
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    url: r.url as string,
    profileName: (r.profile_name as string) ?? null,
    overall: Number(r.overall),
    createdAt: new Date(r.created_at as string),
  }));
}

export async function getBenchmarkForIndustry(
  industry: string,
): Promise<{
  count: number;
  medianOverall: number | null;
  avgOverall: number | null;
  p75: number | null;
  p25: number | null;
} | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      COUNT(*)::int AS count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (score->>'overall')::int) AS median_overall,
      AVG((score->>'overall')::int) AS avg_overall,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY (score->>'overall')::int) AS p75,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY (score->>'overall')::int) AS p25
    FROM audits
    WHERE industry = ${industry}
  `) as Record<string, unknown>[];
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    count: Number(r.count ?? 0),
    medianOverall: r.median_overall != null ? Number(r.median_overall) : null,
    avgOverall: r.avg_overall != null ? Number(r.avg_overall) : null,
    p75: r.p75 != null ? Number(r.p75) : null,
    p25: r.p25 != null ? Number(r.p25) : null,
  };
}
