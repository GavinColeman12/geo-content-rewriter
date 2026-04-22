"use client";

import { useCallback, useState } from "react";
import { INDUSTRIES, type Industry } from "@/lib/industryPrompts";
import type { ScrapeMeta } from "@/components/ScrapeMeta";
import { ScrapeMetaCard } from "@/components/ScrapeMeta";

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

const phaseLabels: Record<Phase, string> = {
  idle: "",
  scraping: "Fetching your page…",
  generating_queries: "Generating the queries customers ask AI…",
  running_queries: "Running live AI searches…",
  analyzing: "Writing your visibility analysis…",
  done: "",
  error: "",
};

export function VisibilityChecker() {
  const [url, setUrl] = useState("");
  const [industry, setIndustry] = useState<Industry>("dental");
  const [city, setCity] = useState("");

  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<ScrapeMeta | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [queries, setQueries] = useState<GeneratedQuery[]>([]);
  const [results, setResults] = useState<(QueryResult | null)[]>([]);
  const [score, setScore] = useState<Score | null>(null);
  const [analysis, setAnalysis] = useState("");
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
      case "analysis_delta":
        setAnalysis((prev) => prev + (evt.text as string));
        break;
      case "error":
        setError((evt.message as string) || "Unknown error");
        setPhase("error");
        break;
    }
  }, []);

  const run = useCallback(async () => {
    setPhase("scraping");
    setMeta(null);
    setProfile(null);
    setQueries([]);
    setResults([]);
    setScore(null);
    setAnalysis("");
    setError(null);

    try {
      const r = await fetch("/api/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, industry, city }),
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("error");
    }
  }, [url, industry, city, handleEvent]);

  const completedCount = results.filter(Boolean).length;

  return (
    <div className="space-y-6">
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
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Your business type
              </label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value as Industry)}
                className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                disabled={isRunning}
              >
                {INDUSTRIES.map((i) => (
                  <option key={i.value} value={i.value}>
                    {i.label}
                  </option>
                ))}
              </select>
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
            onClick={run}
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

      {score && <ScoreCard score={score} profile={profile} />}

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
    </div>
  );
}

function ScoreCard({
  score,
  profile,
}: {
  score: Score;
  profile: Profile | null;
}) {
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
        <div className="border-t border-stone-100 px-4 py-3 text-sm">
          {result.error ? (
            <div className="text-red-700">Error: {result.error}</div>
          ) : (
            <>
              <div className="mb-2 whitespace-pre-wrap text-stone-800">
                {result.answerText}
              </div>
              {result.citations.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                    Sources cited
                  </div>
                  <ul className="space-y-1">
                    {result.citations.map((c, i) => {
                      const matched =
                        result.presence.matchedCitationUrls.includes(c.url);
                      return (
                        <li key={i} className="text-xs">
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className={
                              matched
                                ? "font-medium text-emerald-700 underline underline-offset-2"
                                : "text-stone-600 hover:underline"
                            }
                          >
                            {c.title || c.url}
                          </a>
                          {matched && (
                            <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                              that&apos;s you
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </details>
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

function AnalysisMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let buf: string[] = [];
  let key = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const joined = buf.join("\n").trim();
    if (joined) {
      blocks.push(
        <p key={key++} className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
          {joined}
        </p>,
      );
    }
    buf = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      blocks.push(
        <h3
          key={key++}
          className="mt-5 text-sm font-semibold uppercase tracking-wide text-stone-900 first:mt-0"
        >
          {line.slice(3)}
        </h3>,
      );
    } else {
      buf.push(line);
    }
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}
