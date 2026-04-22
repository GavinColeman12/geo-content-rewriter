"use client";

import { useCallback, useMemo, useState } from "react";
import { CopyInput } from "@/components/CopyInput";
import { ResearchPanel } from "@/components/ResearchPanel";
import { BeforeAfterCompare } from "@/components/BeforeAfterCompare";
import { FAQSection } from "@/components/FAQSection";
import { SchemaCodeBlock } from "@/components/SchemaCodeBlock";
import { ChangeExplanation } from "@/components/ChangeExplanation";
import { ScrapeMetaCard, type ScrapeMeta } from "@/components/ScrapeMeta";
import { parseRewriteOutput } from "@/lib/parseRewrite";
import type { Industry } from "@/lib/industryPrompts";

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
          // ignore malformed meta
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

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [industry, setIndustry] = useState<Industry>("dental");
  const [city, setCity] = useState("");
  const [showResearch, setShowResearch] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<ScrapeMeta | null>(null);
  const [analysis, setAnalysis] = useState("");
  const [rewriteText, setRewriteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseRewriteOutput(rewriteText), [rewriteText]);

  const runAnalysisThenRewrite = useCallback(async () => {
    setPhase("scraping");
    setMeta(null);
    setAnalysis("");
    setRewriteText("");
    setError(null);

    try {
      if (showResearch) {
        setPhase("scraping");
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
        body: JSON.stringify({ url, industry, city }),
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
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
      <header className="mb-10">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          Crescendo Consulting · GEO Content Rewriter
        </div>
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
          Drop your website URL. See it rewritten for AI search.
        </h1>
        <p className="mt-4 max-w-2xl text-balance text-base leading-relaxed text-stone-600">
          AI search drives ~40% of search traffic — but most business sites read
          like 2015 Google SEO, not 2026 AI. We fetch your page, check it against
          the queries real customers ask ChatGPT and Perplexity, and show you
          exactly what to change.
        </p>
      </header>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <CopyInput
          url={url}
          setUrl={setUrl}
          industry={industry}
          setIndustry={setIndustry}
          city={city}
          setCity={setCity}
          showResearch={showResearch}
          setShowResearch={setShowResearch}
          onSubmit={runAnalysisThenRewrite}
          isRunning={isRunning}
        />
      </section>

      {isRunning && (
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
          {phaseLabel}
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-medium">Couldn&apos;t process that URL</div>
          <div className="mt-1">{error}</div>
        </div>
      )}

      {meta && (
        <div className="mt-6">
          <ScrapeMetaCard meta={meta} />
        </div>
      )}

      {showResearch && (analysis || phase === "analyzing") && (
        <section className="mt-8">
          <ResearchPanel
            markdown={analysis}
            isStreaming={phase === "analyzing"}
          />
        </section>
      )}

      {(rewriteText || phase === "rewriting") && (
        <>
          {parsed.pairs.length > 0 && (
            <section className="mt-10">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight text-stone-900">
                  The rewrite
                </h2>
                {phase === "rewriting" && (
                  <div className="flex items-center gap-1.5 text-xs text-stone-500">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
                    streaming
                  </div>
                )}
              </div>
              <p className="mb-4 text-sm text-stone-600">
                Your actual copy on the left, rewritten for AI-search on the
                right. Highlighted phrases are new or significantly changed.
              </p>
              <BeforeAfterCompare pairs={parsed.pairs} />
            </section>
          )}

          {parsed.faqs.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-2 text-xl font-semibold tracking-tight text-stone-900">
                Add these FAQs to your site
              </h2>
              <p className="mb-4 text-sm text-stone-600">
                AI search engines love Q&amp;A structure. These are the
                questions real customers of your business type ask AI.
              </p>
              <FAQSection faqs={parsed.faqs} />
            </section>
          )}

          {(parsed.schemaJson || parsed.schemaRaw) && (
            <section className="mt-10">
              <h2 className="mb-2 text-xl font-semibold tracking-tight text-stone-900">
                Schema markup
              </h2>
              <p className="mb-4 text-sm text-stone-600">
                Paste inside your page&apos;s{" "}
                <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">
                  &lt;script type=&quot;application/ld+json&quot;&gt;
                </code>{" "}
                tag. Replace any{" "}
                <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">
                  [PLACEHOLDER]
                </code>{" "}
                with your real info.
              </p>
              <SchemaCodeBlock
                schemaJson={parsed.schemaJson}
                raw={parsed.schemaRaw}
              />
            </section>
          )}

          {parsed.explanation && (
            <section className="mt-10">
              <ChangeExplanation text={parsed.explanation} />
            </section>
          )}
        </>
      )}

      <footer className="mt-20 border-t border-stone-200 pt-8 text-sm text-stone-600">
        <p className="max-w-2xl">
          This tool shows you <em>what</em> to change. Crescendo Consulting
          implements the full GEO strategy — rewrites, schema deployment, and
          ongoing AI search monitoring.
        </p>
        <a
          href="https://crescendo-consulting.net"
          className="mt-3 inline-block text-sm font-medium text-stone-900 underline underline-offset-4 hover:text-stone-700"
        >
          See our full GEO package →
        </a>
      </footer>
    </main>
  );
}
