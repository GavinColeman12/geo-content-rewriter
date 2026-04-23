"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyInput } from "@/components/CopyInput";
import { ResearchPanel } from "@/components/ResearchPanel";
import { BeforeAfterCompare } from "@/components/BeforeAfterCompare";
import { FAQSection } from "@/components/FAQSection";
import { SchemaCodeBlock } from "@/components/SchemaCodeBlock";
import { ChangeExplanation } from "@/components/ChangeExplanation";
import { ScrapeMetaCard, type ScrapeMeta } from "@/components/ScrapeMeta";
import { parseRewriteOutput } from "@/lib/parseRewrite";
import type { Industry } from "@/lib/industryPrompts";

type Handoff = {
  url: string;
  industry: Industry;
  city: string;
  missedQueries: string[];
} | null;

type Props = {
  handoff?: Handoff;
  onClearHandoff?: () => void;
};

type Phase = "idle" | "scraping" | "analyzing" | "rewriting" | "done" | "error";

const META_DELIM = "\u001E";

async function streamBody(
  res: Response,
  onMeta: (m: ScrapeMeta) => void,
  onChunk: (text: string) => void,
) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let metaParsed = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    if (!metaParsed) {
      const first = buf.indexOf(META_DELIM);
      const second = first === -1 ? -1 : buf.indexOf(META_DELIM, first + 1);
      if (second !== -1) {
        try {
          const meta = JSON.parse(buf.slice(first + 1, second));
          onMeta(meta);
        } catch {
          // ignore
        }
        buf = buf.slice(second + 1);
        metaParsed = true;
        if (buf) onChunk(buf);
        buf = "";
      }
    } else {
      if (buf) {
        onChunk(buf);
        buf = "";
      }
    }
  }
  if (buf) onChunk(buf);
}

export function ContentRewriter({ handoff, onClearHandoff }: Props = {}) {
  const [url, setUrl] = useState("");
  const [industry, setIndustry] = useState<Industry>("dental");
  const [city, setCity] = useState("");
  const [showResearch, setShowResearch] = useState(false);

  useEffect(() => {
    if (handoff) {
      setUrl(handoff.url);
      setIndustry(handoff.industry);
      setCity(handoff.city);
    }
  }, [handoff]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<ScrapeMeta | null>(null);
  const [analysis, setAnalysis] = useState("");
  const [rewriteText, setRewriteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseRewriteOutput(rewriteText), [rewriteText]);

  const run = useCallback(async () => {
    setPhase("scraping");
    setMeta(null);
    setAnalysis("");
    setRewriteText("");
    setError(null);

    try {
      if (showResearch) {
        const r = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, industry, city }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
          throw new Error(j.error || `HTTP ${r.status}`);
        }
        setPhase("analyzing");
        await streamBody(
          r,
          (m) => setMeta(m),
          (txt) => setAnalysis((p) => p + txt),
        );
      }

      setPhase("scraping");
      const r2 = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          industry,
          city,
          targetQueries: handoff?.missedQueries ?? [],
        }),
      });
      if (!r2.ok) {
        const j = await r2.json().catch(() => ({ error: `HTTP ${r2.status}` }));
        throw new Error(j.error || `HTTP ${r2.status}`);
      }
      setPhase("rewriting");
      await streamBody(
        r2,
        (m) => setMeta((prev) => prev ?? m),
        (txt) => setRewriteText((p) => p + txt),
      );
      setPhase("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase("error");
    }
  }, [url, industry, city, showResearch]);

  const isRunning =
    phase === "scraping" || phase === "analyzing" || phase === "rewriting";

  const phaseLabel =
    phase === "scraping"
      ? "Fetching page…"
      : phase === "analyzing"
        ? "Analyzing query coverage…"
        : phase === "rewriting"
          ? "Rewriting for AI search…"
          : "";

  return (
    <div className="space-y-6">
      {handoff && handoff.missedQueries.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase tracking-wide text-emerald-800">
              From your visibility audit
            </div>
            <button
              onClick={() => onClearHandoff?.()}
              className="text-xs text-emerald-700 hover:underline"
              aria-label="Dismiss handoff"
            >
              clear
            </button>
          </div>
          <div className="mb-2 text-sm text-ink">
            Rewrite this page so it can surface for the{" "}
            <span className="font-medium">
              {handoff.missedQueries.length}{" "}
              {handoff.missedQueries.length === 1 ? "query" : "queries"}
            </span>{" "}
            AI search missed:
          </div>
          <ul className="space-y-1 text-sm text-ink-muted">
            {handoff.missedQueries.slice(0, 6).map((q, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-emerald-600">→</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-2xl border border-hairline bg-white p-6 shadow-sm sm:p-8">
        <CopyInput
          url={url}
          setUrl={setUrl}
          industry={industry}
          setIndustry={setIndustry}
          city={city}
          setCity={setCity}
          showResearch={showResearch}
          setShowResearch={setShowResearch}
          onSubmit={run}
          isRunning={isRunning}
        />
      </section>

      {isRunning && (
        <div className="flex items-center gap-2 rounded-xl border border-hairline bg-white px-4 py-3 text-sm text-ink-muted">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
          {phaseLabel}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-medium">Couldn&apos;t process that URL</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      {meta && <ScrapeMetaCard meta={meta} />}

      {showResearch && (analysis || phase === "analyzing") && (
        <ResearchPanel markdown={analysis} isStreaming={phase === "analyzing"} />
      )}

      {(rewriteText || phase === "rewriting") && (
        <>
          {parsed.pairs.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight text-ink">
                  The rewrite
                </h2>
                {phase === "rewriting" && (
                  <div className="flex items-center gap-1.5 text-xs text-ink-light">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
                    streaming
                  </div>
                )}
              </div>
              <p className="mb-4 text-sm text-ink-muted">
                Your actual copy on the left, rewritten for AI-search on the
                right. Highlighted phrases are new or changed.
              </p>
              <BeforeAfterCompare pairs={parsed.pairs} />
            </section>
          )}

          {parsed.faqs.length > 0 && (
            <section>
              <h2 className="mb-2 text-xl font-semibold tracking-tight text-ink">
                Add these FAQs to your site
              </h2>
              <p className="mb-4 text-sm text-ink-muted">
                AI search engines love Q&amp;A structure.
              </p>
              <FAQSection faqs={parsed.faqs} />
            </section>
          )}

          {(parsed.schemaJson || parsed.schemaRaw) && (
            <section>
              <h2 className="mb-2 text-xl font-semibold tracking-tight text-ink">
                Schema markup
              </h2>
              <p className="mb-4 text-sm text-ink-muted">
                Paste inside your page&apos;s{" "}
                <code className="rounded bg-paper-soft px-1.5 py-0.5 text-xs">
                  &lt;script type=&quot;application/ld+json&quot;&gt;
                </code>{" "}
                tag.
              </p>
              <SchemaCodeBlock
                schemaJson={parsed.schemaJson}
                raw={parsed.schemaRaw}
              />
            </section>
          )}

          {parsed.explanation && (
            <ChangeExplanation text={parsed.explanation} />
          )}
        </>
      )}
    </div>
  );
}
