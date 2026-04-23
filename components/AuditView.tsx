"use client";

import type { AuditRow } from "@/lib/db";

type Citation = { url: string; title?: string };
type Presence = {
  verdict: "hit" | "partial" | "miss";
  matchedCitationUrls: string[];
};
type QueryResultData = {
  query: string;
  intent: "research" | "comparison" | "booking";
  answerText: string;
  citations: Citation[];
  presence: Presence;
  error?: string | null;
};
type Competitor = {
  domain: string;
  citations: number;
  queriesWonIndices: number[];
};
type IntentBreakdownData = {
  intent: "research" | "comparison" | "booking";
  total: number;
  hits: number;
  partials: number;
  misses: number;
  score: number;
};
type ScoreData = {
  overall: number;
  hitCount: number;
  partialCount: number;
  missCount: number;
  errorCount: number;
  total: number;
  band: "strong" | "moderate" | "weak" | "invisible";
  bandLabel: string;
  byIntent: IntentBreakdownData[];
};
type GeneratedQueryData = {
  query: string;
  intent: "research" | "comparison" | "booking";
};

export function AuditView({ audit }: { audit: AuditRow }) {
  const score = audit.score as ScoreData;
  const queries = (audit.queries as GeneratedQueryData[]) ?? [];
  const results = (audit.results as QueryResultData[]) ?? [];
  const competitors = (audit.competitors as Competitor[]) ?? [];
  const analysis = audit.analysis;

  return (
    <div className="space-y-6">
      <ScoreCardReadOnly score={score} />
      {competitors.length > 0 && (
        <CompetitorPanelReadOnly
          competitors={competitors}
          queries={queries}
        />
      )}
      {queries.length > 0 && (
        <section className="rounded-2xl border border-hairline bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-3 text-xl font-semibold tracking-tight text-ink">
            Query-by-query results
          </h2>
          <div className="space-y-2">
            {queries.map((q, i) => (
              <QueryRowReadOnly
                key={i}
                query={q}
                result={results[i] ?? null}
              />
            ))}
          </div>
        </section>
      )}
      {analysis && (
        <section className="rounded-2xl border border-hairline bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold tracking-tight text-ink">
            GEO analysis
          </h2>
          <AnalysisMarkdownLite text={analysis} />
        </section>
      )}
    </div>
  );
}

function ScoreCardReadOnly({ score }: { score: ScoreData }) {
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
  const c = 2 * Math.PI * 56;
  const offset = c - (pct / 100) * c;
  return (
    <section className="rounded-2xl border border-hairline bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
            <circle cx="64" cy="64" r="56" className="fill-none stroke-hairline-warm" strokeWidth="10" />
            <circle
              cx="64"
              cy="64"
              r="56"
              className={`fill-none ${ringColor}`}
              strokeWidth="10"
              strokeDasharray={c}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-4xl font-semibold ${bandColor}`}>
              {score.overall}
            </div>
            <div className="text-xs uppercase tracking-wide text-ink-light">
              out of 100
            </div>
          </div>
        </div>
        <div className="flex-1">
          <div className={`text-lg font-semibold ${bandColor}`}>
            {score.bandLabel}
          </div>
          <div className="mt-1 text-sm text-ink-muted">
            Appeared in{" "}
            <span className="font-medium text-ink">
              {score.hitCount}
            </span>{" "}
            of {score.total} AI-search results
            {score.partialCount > 0 &&
              ` (and was mentioned — but not cited — in ${score.partialCount} more)`}
            .
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              {score.hitCount} cited
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              {score.partialCount} mentioned
            </span>
            <span className="rounded-full bg-paper-soft px-2.5 py-1 font-medium text-ink-muted">
              {score.missCount} missed
            </span>
          </div>
        </div>
      </div>
      {score.byIntent?.length > 0 && (
        <div className="mt-6 border-t border-hairline pt-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-light">
            By search intent
          </div>
          <div className="space-y-3">
            {score.byIntent.map((b) => {
              const label =
                b.intent === "research"
                  ? "Research queries"
                  : b.intent === "comparison"
                    ? "Comparison queries"
                    : "Booking-ready queries";
              const barColor =
                b.score >= 70
                  ? "bg-emerald-500"
                  : b.score >= 40
                    ? "bg-amber-500"
                    : b.score >= 15
                      ? "bg-orange-500"
                      : "bg-red-500";
              return (
                <div key={b.intent}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink">
                      {label}
                    </span>
                    <span className="tabular-nums text-ink">
                      {b.hits}/{b.total}{" "}
                      <span className="ml-2 text-xs text-ink-light">
                        {b.score}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-paper-soft">
                    <div
                      className={`h-full ${barColor}`}
                      style={{ width: `${Math.max(3, b.score)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function CompetitorPanelReadOnly({
  competitors,
  queries,
}: {
  competitors: Competitor[];
  queries: GeneratedQueryData[];
}) {
  const total = queries.length;
  return (
    <section className="rounded-2xl border border-hairline bg-white p-6 shadow-sm sm:p-8">
      <h2 className="mb-2 text-xl font-semibold tracking-tight text-ink">
        Who&apos;s winning instead
      </h2>
      <div className="divide-y divide-hairline">
        {competitors.map((c) => {
          const sov = Math.round((c.citations / Math.max(1, total)) * 100);
          return (
            <div key={c.domain} className="py-3 first:pt-0 last:pb-0">
              <div className="mb-1 flex items-center justify-between gap-3">
                <a
                  href={`https://${c.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium text-ink hover:underline"
                >
                  {c.domain}
                </a>
                <div className="shrink-0 text-xs text-ink-light tabular-nums">
                  cited on{" "}
                  <span className="font-medium text-ink">
                    {c.citations}
                  </span>{" "}
                  / {total} queries
                </div>
              </div>
              <div className="mb-1 h-1.5 overflow-hidden rounded-full bg-paper-soft">
                <div
                  className="h-full bg-ink-light"
                  style={{ width: `${Math.max(5, sov)}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {c.queriesWonIndices.map((i) => (
                  <span
                    key={i}
                    title={queries[i]?.query ?? ""}
                    className="inline-flex items-center rounded-full bg-paper-soft px-2 py-0.5 text-[10px] font-medium text-ink-muted"
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

function QueryRowReadOnly({
  query,
  result,
}: {
  query: GeneratedQueryData;
  result: QueryResultData | null;
}) {
  const intentColor =
    query.intent === "booking"
      ? "bg-emerald-50 text-emerald-700"
      : query.intent === "comparison"
        ? "bg-amber-50 text-amber-700"
        : "bg-paper-soft text-ink-muted";
  const Badge = () => {
    if (!result) return <span className="text-ink-light/60">·</span>;
    if (result.error) return <span className="text-red-500">!</span>;
    if (result.presence.verdict === "hit") {
      return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          ✓
        </span>
      );
    }
    if (result.presence.verdict === "partial") {
      return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          ~
        </span>
      );
    }
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-paper-soft text-ink-light">
        ×
      </span>
    );
  };
  return (
    <details className="group rounded-xl border border-hairline bg-white">
      <summary className="flex cursor-pointer items-start gap-3 px-4 py-3 list-none">
        <span className="mt-0.5 shrink-0">
          <Badge />
        </span>
        <span className="flex-1 text-sm text-ink">{query.query}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${intentColor}`}
        >
          {query.intent}
        </span>
        {result && (
          <span className="ml-1 shrink-0 text-ink-light transition group-open:rotate-45">
            +
          </span>
        )}
      </summary>
      {result && !result.error && (
        <div className="border-t border-hairline px-4 py-4 text-sm">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-ink-light">
            What AI answered
          </div>
          <div className="mb-4 whitespace-pre-wrap rounded-lg bg-paper-warm px-3 py-2.5 text-sm leading-relaxed text-ink">
            {result.answerText}
          </div>
          {result.citations.length > 0 && (
            <>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-light">
                Sources cited ({result.citations.length})
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {result.citations.map((c, i) => {
                  const matched = result.presence.matchedCitationUrls.includes(
                    c.url,
                  );
                  let host = "";
                  try {
                    host = new URL(c.url).hostname.replace(/^www\./i, "");
                  } catch {
                    host = c.url;
                  }
                  return (
                    <a
                      key={i}
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
                        matched
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-hairline bg-white hover:border-hairline-input"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`}
                        alt=""
                        className="mt-0.5 h-4 w-4 shrink-0 rounded"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10px] font-medium uppercase tracking-wide text-ink-light">
                          {host}
                        </div>
                        <div
                          className={`mt-0.5 line-clamp-2 text-xs font-medium ${matched ? "text-emerald-900" : "text-ink"}`}
                        >
                          {c.title || c.url}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </details>
  );
}

function AnalysisMarkdownLite({ text }: { text: string }) {
  // Minimal parser: ## headings, bullets, numbered, **bold**, paragraphs.
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let para: string[] = [];
  let ul: string[] = [];
  let ol: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join(" ").trim();
    if (joined) {
      blocks.push(
        <p key={key++} className="text-sm leading-relaxed text-ink">
          {renderInline(joined)}
        </p>,
      );
    }
    para = [];
  };
  const flushUl = () => {
    if (!ul.length) return;
    blocks.push(
      <ul
        key={key++}
        className="ml-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink marker:text-ink-light"
      >
        {ul.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
      </ul>,
    );
    ul = [];
  };
  const flushOl = () => {
    if (!ol.length) return;
    blocks.push(
      <ol
        key={key++}
        className="ml-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink marker:text-ink-light"
      >
        {ol.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
      </ol>,
    );
    ol = [];
  };
  const flush = () => {
    flushPara();
    flushUl();
    flushOl();
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (line.startsWith("## ")) {
      flush();
      blocks.push(
        <h3
          key={key++}
          className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-ink first:mt-0"
        >
          {line.slice(3)}
        </h3>,
      );
      continue;
    }
    const um = line.match(/^\s*[-*]\s+(.*)$/);
    if (um) {
      flushPara();
      flushOl();
      ul.push(um[1]);
      continue;
    }
    const om = line.match(/^\s*\d+\.\s+(.*)$/);
    if (om) {
      flushPara();
      flushUl();
      ol.push(om[1]);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    flushUl();
    flushOl();
    para.push(line);
  }
  flush();
  return <div className="space-y-3">{blocks}</div>;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <strong key={i++} className="font-semibold text-ink">
        {m[0].slice(2, -2)}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? parts : text;
}
