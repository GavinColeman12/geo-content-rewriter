"use client";

import { useCallback, useEffect, useState } from "react";
import { INDUSTRIES, type Industry } from "@/lib/industryPrompts";
import type { ScrapeMeta } from "@/components/ScrapeMeta";
import { ScrapeMetaCard } from "@/components/ScrapeMeta";

const STORAGE_KEY = "geo-visibility-last";
const HISTORY_KEY = "geo-visibility-history-v1";
const MAX_HISTORY_PER_URL = 5;

type Props = {
  onSendToRewriter?: (payload: {
    url: string;
    industry: Industry;
    city: string;
    missedQueries: string[];
  }) => void;
};

type Presence = {
  inCitations: boolean;
  inAnswerText: boolean;
  verdict: "hit" | "partial" | "miss";
  matchedCitationUrls: string[];
};

type QueryResult = {
  query: string;
  intent: "research" | "comparison" | "booking";
  engine: string;
  answerText: string;
  citations: { url: string; title: string }[];
  presence: Presence;
  error?: string;
};

type IntentBreakdown = {
  intent: "research" | "comparison" | "booking";
  total: number;
  hits: number;
  partials: number;
  misses: number;
  score: number;
};

type Score = {
  overall: number;
  hitCount: number;
  partialCount: number;
  missCount: number;
  errorCount: number;
  total: number;
  band: "strong" | "moderate" | "weak" | "invisible";
  bandLabel: string;
  byIntent: IntentBreakdown[];
};

type Profile = {
  name: string;
  domain: string;
  city: string;
  services: string[];
};

type GeneratedQuery = {
  query: string;
  intent: "research" | "comparison" | "booking";
};

type CompetitorDomain = {
  domain: string;
  citations: number;
  queriesWonIndices: number[];
};

type IndustryDetection = {
  detected: Industry;
  confidence: "high" | "medium" | "low";
  used: Industry;
  source: "user" | "detected";
};

type Phase =
  | "idle"
  | "scraping"
  | "generating_queries"
  | "running_queries"
  | "analyzing"
  | "done"
  | "error";

const DELIM = "\u001E";

function looksLikeUrl(v: string | undefined): boolean {
  const trimmed = (v ?? "").trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+(\/.*)?$/i.test(trimmed);
}

type HistoryEntry = {
  url: string;
  savedAt: number;
  overall: number;
  hitCount: number;
  total: number;
  band: Score["band"];
};

function normalizeUrlKey(u: string): string {
  try {
    const x = new URL(u);
    return (x.hostname + x.pathname).replace(/\/$/, "").toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

function readHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as HistoryEntry[];
  } catch {
    return [];
  }
}

function writeHistoryEntry(entry: HistoryEntry) {
  if (typeof window === "undefined") return;
  const existing = readHistory();
  const key = normalizeUrlKey(entry.url);
  const filtered = existing.filter(
    (e) => normalizeUrlKey(e.url) === key,
  );
  const others = existing.filter(
    (e) => normalizeUrlKey(e.url) !== key,
  );
  const next = [entry, ...filtered].slice(0, MAX_HISTORY_PER_URL);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([...next, ...others]));
  } catch {}
}

function priorRunFor(url: string, beforeTs: number): HistoryEntry | null {
  const key = normalizeUrlKey(url);
  const hits = readHistory()
    .filter(
      (e) => normalizeUrlKey(e.url) === key && e.savedAt < beforeTs,
    )
    .sort((a, b) => b.savedAt - a.savedAt);
  return hits[0] ?? null;
}

function historyUniqueByUrl(
  all: HistoryEntry[],
): Array<{ key: string; url: string; runs: HistoryEntry[] }> {
  const byKey = new Map<string, { url: string; runs: HistoryEntry[] }>();
  for (const e of all) {
    const key = normalizeUrlKey(e.url);
    const group = byKey.get(key);
    if (group) {
      group.runs.push(e);
    } else {
      byKey.set(key, { url: e.url, runs: [e] });
    }
  }
  return Array.from(byKey.entries())
    .map(([key, g]) => ({
      key,
      url: g.url,
      runs: g.runs.sort((a, b) => b.savedAt - a.savedAt),
    }))
    .sort((a, b) => (b.runs[0]?.savedAt ?? 0) - (a.runs[0]?.savedAt ?? 0));
}

function humanTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

type PersistedState = {
  version: 1;
  savedAt: number;
  url: string;
  industry: Industry;
  city: string;
  autoIndustry: boolean;
  detection: IndustryDetection | null;
  meta: ScrapeMeta | null;
  profile: Profile | null;
  queries: GeneratedQuery[];
  results: (QueryResult | null)[];
  score: Score | null;
  competitors: CompetitorDomain[];
  analysis: string;
};

const EXAMPLE_URLS: {
  url: string;
  industry: Industry;
  city: string;
  label: string;
}[] = [
  {
    url: "https://www.theaustindentist.com",
    industry: "dental",
    city: "Austin, TX",
    label: "Dental practice",
  },
  {
    url: "https://www.morganandmorgan.com",
    industry: "law_firm",
    city: "Orlando, FL",
    label: "Law firm",
  },
  {
    url: "https://skinspirit.com",
    industry: "medspa",
    city: "San Francisco, CA",
    label: "Medspa",
  },
  {
    url: "https://www.arsplumbing.com",
    industry: "home_services",
    city: "Nashville, TN",
    label: "Home services",
  },
];

const phaseLabels: Record<Phase, string> = {
  idle: "",
  scraping: "Fetching your page…",
  generating_queries: "Generating the queries customers ask AI…",
  running_queries: "Running live AI searches…",
  analyzing: "Writing your visibility analysis…",
  done: "",
  error: "",
};

export function VisibilityChecker({ onSendToRewriter }: Props = {}) {
  const [url, setUrl] = useState("");
  const [industry, setIndustry] = useState<Industry>("dental");
  const [city, setCity] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<ScrapeMeta | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [queries, setQueries] = useState<GeneratedQuery[]>([]);
  const [results, setResults] = useState<(QueryResult | null)[]>([]);
  const [score, setScore] = useState<Score | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorDomain[]>([]);
  const [analysis, setAnalysis] = useState("");
  const [autoIndustry, setAutoIndustry] = useState(true);
  const [detection, setDetection] = useState<IndustryDetection | null>(null);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [priorRun, setPriorRun] = useState<HistoryEntry | null>(null);
  const [justCompletedAt, setJustCompletedAt] = useState<number | null>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{
    ageMinutes: number;
    id: string;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyGroups, setHistoryGroups] = useState<
    Array<{ key: string; url: string; runs: HistoryEntry[] }>
  >([]);
  const refreshHistoryGroups = useCallback(() => {
    setHistoryGroups(historyUniqueByUrl(readHistory()));
  }, []);

  // Restore from URL params or localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    refreshHistoryGroups();
    const params = new URLSearchParams(window.location.search);
    const qUrl = params.get("url");
    const qIndustry = params.get("industry") as Industry | null;
    const qCity = params.get("city");
    if (qUrl) {
      setUrl(qUrl);
      if (
        qIndustry &&
        INDUSTRIES.find((i) => i.value === qIndustry)
      ) {
        setIndustry(qIndustry);
        setAutoIndustry(false);
      }
      if (qCity) setCity(qCity);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as PersistedState;
      if (s.version !== 1) return;
      setUrl(s.url);
      setIndustry(s.industry);
      setCity(s.city);
      setAutoIndustry(s.autoIndustry);
      setDetection(s.detection);
      setMeta(s.meta);
      setProfile(s.profile);
      setQueries(s.queries);
      setResults(s.results);
      setScore(s.score);
      setCompetitors(s.competitors);
      setAnalysis(s.analysis);
      if (s.score) setPhase("done");
      setRestoredAt(s.savedAt);
    } catch {
      // ignore malformed state
    }
  }, []);

  // Save to localStorage only when a run just completed (not when restored).
  useEffect(() => {
    if (!justCompletedAt || phase !== "done" || !score || typeof window === "undefined") return;
    const prior = priorRunFor(url, justCompletedAt);
    setPriorRun(prior);
    const toSave: PersistedState = {
      version: 1,
      savedAt: justCompletedAt,
      url,
      industry,
      city,
      autoIndustry,
      detection,
      meta,
      profile,
      queries,
      results,
      score,
      competitors,
      analysis,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch {}
    writeHistoryEntry({
      url,
      savedAt: justCompletedAt,
      overall: score.overall,
      hitCount: score.hitCount,
      total: score.total,
      band: score.band,
    });
    refreshHistoryGroups();
  }, [
    justCompletedAt,
    phase,
    score,
    url,
    industry,
    city,
    autoIndustry,
    detection,
    meta,
    profile,
    queries,
    results,
    competitors,
    analysis,
  ]);
  const [error, setError] = useState<string | null>(null);

  const valid = looksLikeUrl(url);
  const isRunning =
    phase === "scraping" ||
    phase === "generating_queries" ||
    phase === "running_queries" ||
    phase === "analyzing";

  const handleEvent = useCallback((evt: Record<string, unknown>) => {
    switch (evt.type) {
      case "phase":
        setPhase(evt.phase as Phase);
        break;
      case "scrape":
        setMeta(evt.data as ScrapeMeta);
        break;
      case "profile":
        setProfile(evt.data as Profile);
        break;
      case "queries": {
        const qs = evt.data as GeneratedQuery[];
        setQueries(qs);
        setResults(new Array(qs.length).fill(null));
        break;
      }
      case "result": {
        const idx = evt.index as number;
        const data = evt.data as QueryResult;
        setResults((prev) => {
          const next = [...prev];
          next[idx] = data;
          return next;
        });
        break;
      }
      case "score":
        setScore(evt.data as Score);
        break;
      case "competitors":
        setCompetitors(evt.data as CompetitorDomain[]);
        break;
      case "industry_detected":
        setDetection(evt.data as IndustryDetection);
        break;
      case "analysis_delta":
        setAnalysis((prev) => prev + (evt.text as string));
        break;
      case "cached":
        setCacheInfo(evt.data as { ageMinutes: number; id: string });
        setAuditId((evt.data as { id: string }).id);
        break;
      case "audit_saved":
        setAuditId(evt.id as string);
        break;
      case "error":
        setError((evt.message as string) || "Unknown error");
        setPhase("error");
        break;
    }
  }, []);

  const run = useCallback(async (opts?: { forceFresh?: boolean }) => {
    setPhase("scraping");
    setMeta(null);
    setProfile(null);
    setQueries([]);
    setResults([]);
    setScore(null);
    setCompetitors([]);
    setAnalysis("");
    setDetection(null);
    setError(null);
    setRestoredAt(null);
    setCacheInfo(null);
    setAuditId(null);

    try {
      const r = await fetch("/api/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          industry,
          city,
          autoIndustry,
          forceFresh: !!opts?.forceFresh,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        while (true) {
          const start = buf.indexOf(DELIM);
          if (start === -1) break;
          const end = buf.indexOf(DELIM, start + 1);
          if (end === -1) break;
          const payload = buf.slice(start + 1, end);
          buf = buf.slice(end + 1);
          try {
            const evt = JSON.parse(payload);
            handleEvent(evt);
          } catch {
            // swallow malformed
          }
        }
      }
      setJustCompletedAt(Date.now());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("error");
    }
  }, [url, industry, city, autoIndustry, handleEvent]);

  const completedCount = results.filter(Boolean).length;

  const hasResult = phase === "done" && !!score;
  const hasHistory = historyGroups.length > 0;

  return (
    <div className="space-y-6">
      {hasHistory && (
        <HistoryPanel
          groups={historyGroups}
          open={historyOpen}
          onToggle={() => setHistoryOpen((v) => !v)}
          onPick={(g) => {
            setUrl(g.url);
            setHistoryOpen(false);
          }}
          onClear={() => {
            try {
              localStorage.removeItem(HISTORY_KEY);
            } catch {}
            setHistoryGroups([]);
            setHistoryOpen(false);
          }}
        />
      )}

      {restoredAt && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-xs text-stone-600">
          <span>
            Restored from your last audit — run it again to refresh, or paste a new URL.
          </span>
          <button
            onClick={() => {
              try {
                localStorage.removeItem(STORAGE_KEY);
              } catch {}
              setRestoredAt(null);
              setPhase("idle");
              setMeta(null);
              setProfile(null);
              setQueries([]);
              setResults([]);
              setScore(null);
              setCompetitors([]);
              setAnalysis("");
              setDetection(null);
            }}
            className="shrink-0 text-stone-700 underline underline-offset-2 hover:text-stone-900"
          >
            clear
          </button>
        </div>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Your website URL
            </label>
            <input
              type="url"
              value={url ?? ""}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="brightsmiledental.com  —  or  —  https://yoursite.com"
              className="w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
              disabled={isRunning}
            />
            <p className="mt-1 text-xs text-stone-500">
              We&apos;ll scrape it, generate the questions your customers ask
              AI, then run those questions through live AI search to see if you
              show up.
            </p>
            {!url && !hasResult && !isRunning && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-[11px] text-stone-500">
                  Try one:
                </span>
                {EXAMPLE_URLS.map((ex) => (
                  <button
                    key={ex.url}
                    type="button"
                    onClick={() => {
                      setUrl(ex.url);
                      setCity(ex.city);
                      setIndustry(ex.industry);
                    }}
                    className="rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-[11px] text-stone-700 transition hover:border-stone-400 hover:bg-stone-50"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-stone-700">
                  Your business type
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-stone-500">
                  <input
                    type="checkbox"
                    checked={autoIndustry}
                    onChange={(e) => setAutoIndustry(e.target.checked)}
                    disabled={isRunning}
                    className="h-3 w-3 rounded border-stone-400 text-stone-900 focus:ring-stone-900/20"
                  />
                  auto-detect
                </label>
              </div>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value as Industry)}
                className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10 disabled:opacity-60"
                disabled={isRunning || autoIndustry}
              >
                {INDUSTRIES.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
              {autoIndustry && !detection && (
                <p className="mt-1 text-[11px] text-stone-500">
                  We&apos;ll detect from the page.
                </p>
              )}
              {detection && (
                <p className="mt-1 text-[11px] text-stone-600">
                  {detection.source === "detected" ? (
                    <>
                      Detected:{" "}
                      <span className="font-medium text-stone-900">
                        {INDUSTRIES.find((i) => i.value === detection.used)
                          ?.label ?? detection.used}
                      </span>{" "}
                      <span className="text-stone-400">
                        ({detection.confidence} confidence)
                      </span>
                    </>
                  ) : (
                    <>
                      Using your selection{" "}
                      {detection.confidence !== "low" && (
                        <span className="text-stone-400">
                          (detector also suggested{" "}
                          {INDUSTRIES.find(
                            (i) => i.value === detection.detected,
                          )?.label ?? detection.detected}
                          )
                        </span>
                      )}
                    </>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                City or region you serve
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Austin, TX"
                className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                disabled={isRunning}
              />
            </div>
          </div>

          <button
            onClick={() => run()}
            disabled={isRunning || !valid}
            className="w-full rounded-lg bg-stone-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRunning ? "Running…" : "Check my GEO visibility"}
          </button>

          <p className="text-xs text-stone-500">
            Uses Claude&apos;s live web search — the same real web that
            ChatGPT and Perplexity search. Takes ~30–60 seconds. One free run
            per day per IP.
          </p>
        </div>
      </section>

      {phase !== "idle" && phase !== "done" && phase !== "error" && (
        <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
          <span>{phaseLabels[phase]}</span>
          {phase === "running_queries" && queries.length > 0 && (
            <span className="ml-auto text-xs text-stone-500">
              {completedCount} / {queries.length}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-medium">Something went wrong</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      {meta && <ScrapeMetaCard meta={meta} />}

      {profile && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
            Identified as
          </div>
          <div className="text-stone-900">
            <span className="font-medium">{profile.name}</span>
            {profile.city && (
              <span className="text-stone-500"> · {profile.city}</span>
            )}
            <span className="text-stone-500"> · {profile.domain}</span>
          </div>
        </div>
      )}

      {cacheInfo && phase !== "error" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm">
          <div className="text-sky-900">
            <span className="font-medium">Served from cache</span> — this audit
            was run{" "}
            {cacheInfo.ageMinutes < 60
              ? `${cacheInfo.ageMinutes}m ago`
              : `${Math.round(cacheInfo.ageMinutes / 60)}h ago`}
            . Saved you ~$0.40 in API credits and didn&apos;t count against
            your rate limit.
          </div>
          <button
            onClick={() => run({ forceFresh: true })}
            disabled={isRunning}
            className="shrink-0 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-medium text-sky-900 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Re-run fresh
          </button>
        </div>
      )}
      {score && <ScoreCard score={score} profile={profile} priorRun={priorRun} />}

      {competitors.length > 0 && (
        <CompetitorPanel
          competitors={competitors}
          queries={queries}
          totalQueries={queries.length}
        />
      )}

      {queries.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-semibold tracking-tight text-stone-900">
            Query-by-query results
          </h2>
          <p className="mb-4 text-sm text-stone-600">
            Each query was run against live AI search. We check if your domain
            was cited, or your name appeared in the answer.
          </p>
          <div className="space-y-3">
            {queries.map((q, i) => (
              <QueryRow
                key={i}
                query={q}
                result={results[i] ?? null}
                isRunning={phase === "running_queries"}
              />
            ))}
          </div>
        </section>
      )}

      {analysis && (
        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight text-stone-900">
              GEO analysis
            </h2>
            {phase === "analyzing" && (
              <div className="flex items-center gap-1.5 text-xs text-stone-500">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
                writing
              </div>
            )}
          </div>
          <AnalysisMarkdown text={analysis} />
        </section>
      )}

      {phase === "done" && score && (
        <NextStepsBar
          onFixGaps={() => {
            if (!onSendToRewriter) return;
            const missed = results
              .filter(
                (r): r is QueryResult =>
                  !!r && r.presence.verdict !== "hit" && !r.error,
              )
              .map((r) => r.query);
            onSendToRewriter({ url, industry, city, missedQueries: missed });
          }}
          onCopyReport={() => {
            const md = buildReportMarkdown({
              url,
              profile,
              score,
              competitors,
              queries,
              results,
              analysis,
            });
            navigator.clipboard.writeText(md);
          }}
          onCopyShareLink={() => {
            let link: string;
            if (auditId) {
              // Permalink to the exact persisted audit
              link = `${window.location.origin}/a/${auditId}`;
            } else {
              // Fallback: prefill the form for a fresh run
              const p = new URLSearchParams({ url, industry, city });
              link = `${window.location.origin}${window.location.pathname}?${p}`;
            }
            navigator.clipboard.writeText(link);
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000);
          }}
          linkCopied={linkCopied}
          missedCount={
            results.filter(
              (r) => r && r.presence.verdict !== "hit" && !r.error,
            ).length
          }
          rewriterEnabled={!!onSendToRewriter}
        />
      )}
    </div>
  );
}

function HistoryPanel({
  groups,
  open,
  onToggle,
  onPick,
  onClear,
}: {
  groups: Array<{ key: string; url: string; runs: HistoryEntry[] }>;
  open: boolean;
  onToggle: () => void;
  onPick: (g: { key: string; url: string; runs: HistoryEntry[] }) => void;
  onClear: () => void;
}) {
  const totalRuns = groups.reduce((a, g) => a + g.runs.length, 0);
  return (
    <div className="rounded-xl border border-stone-200 bg-white">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-xs"
      >
        <span className="flex items-center gap-2 text-stone-600">
          <span className="font-medium text-stone-900">Recent audits</span>
          <span className="text-stone-400">
            {groups.length} {groups.length === 1 ? "URL" : "URLs"} · {totalRuns}{" "}
            {totalRuns === 1 ? "run" : "runs"}
          </span>
        </span>
        <span className="text-stone-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-stone-100">
          <ul className="divide-y divide-stone-100">
            {groups.slice(0, 8).map((g) => {
              const latest = g.runs[0];
              const prev = g.runs[1];
              const delta =
                latest && prev ? latest.overall - prev.overall : null;
              return (
                <li key={g.key}>
                  <button
                    onClick={() => onPick(g)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-stone-900">
                        {g.key}
                      </div>
                      <div className="mt-0.5 text-[11px] text-stone-500">
                        {humanTimeAgo(latest.savedAt)} ·{" "}
                        {g.runs.length === 1
                          ? "1 run"
                          : `${g.runs.length} runs`}
                      </div>
                    </div>
                    {g.runs.length > 1 && (
                      <Sparkline
                        values={g.runs
                          .slice()
                          .reverse()
                          .map((r) => r.overall)}
                      />
                    )}
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-stone-900 tabular-nums">
                        {latest.overall}
                      </div>
                      {delta !== null && delta !== 0 && (
                        <div
                          className={`text-[10px] font-medium tabular-nums ${
                            delta > 0 ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {delta > 0 ? "▲" : "▼"}
                          {Math.abs(delta)}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 text-stone-300">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2 text-[11px]">
            <span className="text-stone-500">
              Stored in your browser only. Click a row to reload the URL.
            </span>
            <button
              onClick={onClear}
              className="text-stone-500 underline underline-offset-2 hover:text-stone-700"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 48;
  const h = 18;
  const max = Math.max(...values, 100);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const pts = values
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const first = values[0];
  const color =
    last > first ? "#10b981" : last < first ? "#ef4444" : "#78716c";
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className="shrink-0"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

function NextStepsBar({
  onFixGaps,
  onCopyReport,
  onCopyShareLink,
  linkCopied,
  missedCount,
  rewriterEnabled,
}: {
  onFixGaps: () => void;
  onCopyReport: () => void;
  onCopyShareLink: () => void;
  linkCopied: boolean;
  missedCount: number;
  rewriterEnabled: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="rounded-2xl border border-stone-200 bg-stone-50 p-6">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
        Next steps
      </div>
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-stone-900">
        Turn this audit into changes
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <button
          onClick={onFixGaps}
          disabled={!rewriterEnabled || missedCount === 0}
          className="rounded-xl border border-stone-900 bg-stone-900 px-5 py-4 text-left text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <div className="text-sm">
            Fix the {missedCount} missed {missedCount === 1 ? "query" : "queries"}{" "}
            →
          </div>
          <div className="mt-1 text-xs font-normal text-stone-300">
            Jump to the Content Rewriter with these queries loaded as the target.
          </div>
        </button>
        <button
          onClick={() => {
            onCopyReport();
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded-xl border border-stone-300 bg-white px-5 py-4 text-left text-sm font-medium text-stone-900 transition hover:border-stone-400"
        >
          <div className="text-sm">
            {copied ? "Report copied ✓" : "Copy full report"}
          </div>
          <div className="mt-1 text-xs font-normal text-stone-500">
            Markdown with score, competitors, queries, and analysis.
          </div>
        </button>
        <button
          onClick={onCopyShareLink}
          className="rounded-xl border border-stone-300 bg-white px-5 py-4 text-left text-sm font-medium text-stone-900 transition hover:border-stone-400"
        >
          <div className="text-sm">
            {linkCopied ? "Link copied ✓" : "Copy share link"}
          </div>
          <div className="mt-1 text-xs font-normal text-stone-500">
            Prefilled URL — recipient can re-run the audit in one click.
          </div>
        </button>
      </div>
    </section>
  );
}

function buildReportMarkdown({
  url,
  profile,
  score,
  competitors,
  queries,
  results,
  analysis,
}: {
  url: string;
  profile: { name: string; domain: string; city: string; services: string[] } | null;
  score: Score;
  competitors: CompetitorDomain[];
  queries: GeneratedQuery[];
  results: (QueryResult | null)[];
  analysis: string;
}): string {
  const lines: string[] = [];
  lines.push(`# GEO Visibility Audit — ${profile?.name ?? url}`);
  lines.push("");
  lines.push(`- URL: ${url}`);
  if (profile?.domain) lines.push(`- Domain: ${profile.domain}`);
  if (profile?.city) lines.push(`- Location: ${profile.city}`);
  lines.push(
    `- Generated: ${new Date().toISOString().slice(0, 10)} via crescendo-consulting.net`,
  );
  lines.push("");
  lines.push(`## Score: ${score.overall} / 100 — ${score.bandLabel}`);
  lines.push(
    `${score.hitCount} cited · ${score.partialCount} mentioned · ${score.missCount} missed${score.errorCount ? ` · ${score.errorCount} errors` : ""}`,
  );
  lines.push("");
  if (score.byIntent.length > 0) {
    lines.push("### By search intent");
    for (const b of score.byIntent) {
      const label =
        b.intent === "research"
          ? "Research"
          : b.intent === "comparison"
            ? "Comparison"
            : "Booking";
      lines.push(`- ${label}: ${b.hits}/${b.total} (${b.score}%)`);
    }
    lines.push("");
  }
  if (competitors.length > 0) {
    lines.push("## Who's winning instead");
    for (const c of competitors) {
      const qs = c.queriesWonIndices.map((i) => `Q${i + 1}`).join(", ");
      lines.push(`- **${c.domain}** — cited on ${c.citations}/${queries.length} queries (${qs})`);
    }
    lines.push("");
  }
  lines.push("## Queries tested");
  queries.forEach((q, i) => {
    const r = results[i];
    const verdict = r?.error
      ? "error"
      : r?.presence.verdict === "hit"
        ? "✓ cited"
        : r?.presence.verdict === "partial"
          ? "~ mentioned"
          : "✗ missed";
    lines.push(`${i + 1}. [${verdict}] (${q.intent}) ${q.query}`);
  });
  lines.push("");
  if (analysis.trim()) {
    lines.push("## Analysis");
    lines.push(analysis.trim());
    lines.push("");
  }
  lines.push(
    "_Generated by Crescendo Consulting's GEO Visibility Checker._",
  );
  return lines.join("\n");
}

function ScoreCard({
  score,
  profile,
  priorRun,
}: {
  score: Score;
  profile: Profile | null;
  priorRun: HistoryEntry | null;
}) {
  const delta =
    priorRun && priorRun.overall !== score.overall
      ? score.overall - priorRun.overall
      : null;
  const deltaDaysAgo = priorRun
    ? Math.max(1, Math.round((Date.now() - priorRun.savedAt) / 86400000))
    : null;
  const bandColor =
    score.band === "strong"
      ? "text-emerald-600"
      : score.band === "moderate"
        ? "text-amber-600"
        : score.band === "weak"
          ? "text-orange-600"
          : "text-red-600";

  const ringColor =
    score.band === "strong"
      ? "stroke-emerald-500"
      : score.band === "moderate"
        ? "stroke-amber-500"
        : score.band === "weak"
          ? "stroke-orange-500"
          : "stroke-red-500";

  const pct = Math.max(0, Math.min(100, score.overall));
  const circumference = 2 * Math.PI * 56;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              className="fill-none stroke-stone-200"
              strokeWidth="10"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              className={`fill-none ${ringColor} transition-all`}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-4xl font-semibold ${bandColor}`}>
              {score.overall}
            </div>
            <div className="text-xs uppercase tracking-wide text-stone-500">
              out of 100
            </div>
          </div>
        </div>
        <div className="flex-1">
          <div className={`text-lg font-semibold ${bandColor}`}>
            {score.bandLabel}
          </div>
          {profile && (
            <div className="mt-1 text-sm text-stone-600">
              {profile.name} appeared in{" "}
              <span className="font-medium text-stone-900">
                {score.hitCount}
              </span>{" "}
              of {score.total} AI-search results
              {score.partialCount > 0 &&
                ` (and was mentioned — but not cited — in ${score.partialCount} more)`}
              .
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              {score.hitCount} cited
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              {score.partialCount} mentioned
            </span>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-700">
              {score.missCount} missed
            </span>
            {score.errorCount > 0 && (
              <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-500">
                {score.errorCount} errors
              </span>
            )}
            {delta !== null && (
              <span
                className={`rounded-full px-2.5 py-1 font-medium ${
                  delta > 0
                    ? "bg-emerald-600 text-white"
                    : "bg-red-600 text-white"
                }`}
                title={
                  deltaDaysAgo
                    ? `Previous audit ${deltaDaysAgo} day${deltaDaysAgo === 1 ? "" : "s"} ago: ${priorRun?.overall}`
                    : undefined
                }
              >
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} vs. last run
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-relaxed text-stone-500">
            <span>
              Tested against live AI search via Claude&apos;s web-search tool.
              Results reflect what ChatGPT, Perplexity, and Google AI Overviews
              surface for the same queries — they share the same live web index.
            </span>
            <details className="group inline-block">
              <summary className="cursor-pointer list-none text-stone-600 underline underline-offset-2 hover:text-stone-900">
                How is this scored?
              </summary>
              <div className="mt-2 max-w-xl rounded-lg border border-stone-200 bg-stone-50 p-3 text-[11px] leading-relaxed text-stone-600">
                Score ={" "}
                <code className="rounded bg-white px-1 py-0.5 text-stone-900">
                  round((hits + 0.5 × mentions) / total × 100)
                </code>
                .{" "}
                <strong>Hit</strong> = your domain appeared in the AI&apos;s
                cited sources. <strong>Mentioned</strong> = your business name
                appeared in the AI&apos;s answer text but the AI cited a
                different source (like a directory) instead of your page.{" "}
                <strong>Missed</strong> = no appearance in citations or answer.
                We test {score.total} queries across research, comparison, and
                booking intent to balance the sample.
              </div>
            </details>
          </div>
        </div>
      </div>

      {score.byIntent.length > 0 && (
        <div className="mt-6 border-t border-stone-200 pt-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-500">
            By search intent
          </div>
          <div className="space-y-3">
            {score.byIntent.map((b) => (
              <IntentBar key={b.intent} breakdown={b} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CompetitorPanel({
  competitors,
  queries,
  totalQueries,
}: {
  competitors: CompetitorDomain[];
  queries: GeneratedQuery[];
  totalQueries: number;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight text-stone-900">
          Who&apos;s winning instead
        </h2>
        <span className="text-xs text-stone-500">
          top cited domains, excluding social &amp; directories
        </span>
      </div>
      <p className="mb-4 text-sm text-stone-600">
        These are the other sites AI search cited for your queries. If your
        competitors are here and you&apos;re not, this is where to focus.
      </p>
      <div className="divide-y divide-stone-100">
        {competitors.map((c) => {
          const shareOfVoice = Math.round(
            (c.citations / Math.max(1, totalQueries)) * 100,
          );
          return (
            <div key={c.domain} className="py-3 first:pt-0 last:pb-0">
              <div className="mb-1 flex items-center justify-between gap-3">
                <a
                  href={`https://${c.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium text-stone-900 hover:underline"
                >
                  {c.domain}
                </a>
                <div className="shrink-0 text-xs text-stone-500 tabular-nums">
                  cited on{" "}
                  <span className="font-medium text-stone-900">
                    {c.citations}
                  </span>{" "}
                  / {totalQueries} queries
                </div>
              </div>
              <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full bg-stone-400"
                  style={{ width: `${Math.max(5, shareOfVoice)}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {c.queriesWonIndices.map((i) => (
                  <span
                    key={i}
                    title={queries[i]?.query ?? ""}
                    className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600"
                  >
                    Q{i + 1}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function IntentBar({ breakdown: b }: { breakdown: IntentBreakdown }) {
  const intentLabel =
    b.intent === "research"
      ? "Research queries"
      : b.intent === "comparison"
        ? "Comparison queries"
        : "Booking-ready queries";
  const intentSub =
    b.intent === "research"
      ? "people learning about the service"
      : b.intent === "comparison"
        ? "evaluating their options"
        : "ready to book or buy";

  const barColor =
    b.score >= 70
      ? "bg-emerald-500"
      : b.score >= 40
        ? "bg-amber-500"
        : b.score >= 15
          ? "bg-orange-500"
          : "bg-red-500";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <div>
          <span className="font-medium text-stone-900">{intentLabel}</span>{" "}
          <span className="text-xs text-stone-500">{intentSub}</span>
        </div>
        <div className="text-sm tabular-nums text-stone-900">
          <span className="font-medium">{b.hits}</span>
          <span className="text-stone-400">/{b.total}</span>
          <span className="ml-2 text-xs text-stone-500">
            {b.score}%
          </span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-100">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${Math.max(3, b.score)}%` }}
        />
      </div>
    </div>
  );
}

function QueryRow({
  query,
  result,
  isRunning,
}: {
  query: GeneratedQuery;
  result: QueryResult | null;
  isRunning: boolean;
}) {
  const intentColor =
    query.intent === "booking"
      ? "bg-emerald-50 text-emerald-700"
      : query.intent === "comparison"
        ? "bg-amber-50 text-amber-700"
        : "bg-stone-100 text-stone-700";

  return (
    <details className="group rounded-xl border border-stone-200 bg-white">
      <summary className="flex cursor-pointer items-start gap-3 px-4 py-3 list-none">
        <span className="mt-0.5 shrink-0">
          {result ? (
            <VerdictBadge verdict={result.presence.verdict} />
          ) : isRunning ? (
            <span className="inline-flex h-6 w-6 items-center justify-center">
              <span className="h-3 w-3 animate-pulse rounded-full bg-stone-300"></span>
            </span>
          ) : (
            <span className="inline-flex h-6 w-6 items-center justify-center text-stone-300">
              ·
            </span>
          )}
        </span>
        <span className="flex-1 text-sm text-stone-900">{query.query}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${intentColor}`}
        >
          {query.intent}
        </span>
        {result && (
          <span className="ml-1 shrink-0 text-stone-400 transition group-open:rotate-45">
            +
          </span>
        )}
      </summary>
      {result && (
        <div className="border-t border-stone-100 px-4 py-4 text-sm">
          {result.error ? (
            <div className="text-red-700">Error: {result.error}</div>
          ) : (
            <>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                What AI answered
              </div>
              <div className="mb-4 whitespace-pre-wrap rounded-lg bg-stone-50 px-3 py-2.5 text-sm leading-relaxed text-stone-800">
                {result.answerText}
              </div>
              {result.citations.length > 0 && (
                <>
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                    Sources cited ({result.citations.length})
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {result.citations.map((c, i) => (
                      <CitationCard
                        key={i}
                        url={c.url}
                        title={c.title || ""}
                        matched={result.presence.matchedCitationUrls.includes(
                          c.url,
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </details>
  );
}

function CitationCard({
  url,
  title,
  matched,
}: {
  url: string;
  title: string;
  matched: boolean;
}) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    host = url;
  }
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`group flex items-start gap-2.5 rounded-lg border px-3 py-2 transition ${
        matched
          ? "border-emerald-300 bg-emerald-50 hover:border-emerald-400"
          : "border-stone-200 bg-white hover:border-stone-300"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={favicon}
        alt=""
        className="mt-0.5 h-4 w-4 shrink-0 rounded"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[10px] font-medium uppercase tracking-wide text-stone-500">
            {host}
          </span>
          {matched && (
            <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
              you
            </span>
          )}
        </div>
        <div
          className={`mt-0.5 line-clamp-2 text-xs font-medium ${
            matched ? "text-emerald-900" : "text-stone-900 group-hover:text-stone-700"
          }`}
        >
          {title || url}
        </div>
      </div>
    </a>
  );
}

function VerdictBadge({ verdict }: { verdict: "hit" | "partial" | "miss" }) {
  if (verdict === "hit") {
    return (
      <span
        title="Your site was cited as a source"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
      >
        ✓
      </span>
    );
  }
  if (verdict === "partial") {
    return (
      <span
        title="Your business name was mentioned — but not cited"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700"
      >
        ~
      </span>
    );
  }
  return (
    <span
      title="Not cited, not mentioned"
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-stone-500"
    >
      ×
    </span>
  );
}

function renderInline(text: string, keyBase: string): React.ReactNode {
  // Handles **bold** and `code` inline. Returns an array of React nodes.
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyBase}-b-${i++}`} className="font-semibold text-stone-900">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <code
          key={`${keyBase}-c-${i++}`}
          className="rounded bg-stone-100 px-1 py-0.5 text-[0.9em] text-stone-800"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
}

function AnalysisMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let para: string[] = [];
  let ulItems: string[] = [];
  let olItems: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    const joined = para.join(" ").trim();
    if (joined) {
      blocks.push(
        <p
          key={key++}
          className="text-sm leading-relaxed text-stone-800"
        >
          {renderInline(joined, `p-${key}`)}
        </p>,
      );
    }
    para = [];
  };
  const flushUl = () => {
    if (ulItems.length === 0) return;
    blocks.push(
      <ul
        key={key++}
        className="ml-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-800 marker:text-stone-400"
      >
        {ulItems.map((it, i) => (
          <li key={i}>{renderInline(it, `ul-${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    ulItems = [];
  };
  const flushOl = () => {
    if (olItems.length === 0) return;
    blocks.push(
      <ol
        key={key++}
        className="ml-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-stone-800 marker:text-stone-400"
      >
        {olItems.map((it, i) => (
          <li key={i}>{renderInline(it, `ol-${key}-${i}`)}</li>
        ))}
      </ol>,
    );
    olItems = [];
  };
  const flushAll = () => {
    flushPara();
    flushUl();
    flushOl();
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("## ")) {
      flushAll();
      blocks.push(
        <h3
          key={key++}
          className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-stone-900 first:mt-0"
        >
          {line.slice(3)}
        </h3>,
      );
      continue;
    }
    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (ulMatch) {
      flushPara();
      flushOl();
      ulItems.push(ulMatch[1]);
      continue;
    }
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (olMatch) {
      flushPara();
      flushUl();
      olItems.push(olMatch[1]);
      continue;
    }
    if (line.trim() === "") {
      flushAll();
      continue;
    }
    flushUl();
    flushOl();
    para.push(line);
  }
  flushAll();
  return <div className="space-y-3">{blocks}</div>;
}
