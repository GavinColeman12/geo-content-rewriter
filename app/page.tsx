"use client";

import { useState } from "react";
import { VisibilityChecker } from "@/components/VisibilityChecker";
import { ContentRewriter } from "@/components/ContentRewriter";
import type { Industry } from "@/lib/industryPrompts";

type Tab = "visibility" | "rewriter";

type Handoff = {
  url: string;
  industry: Industry;
  city: string;
  missedQueries: string[];
} | null;

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("visibility");
  const [handoff, setHandoff] = useState<Handoff>(null);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:py-20">
      <header className="mb-10">
        <div className="eyebrow mb-4 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-blue"></span>
          Crescendo Consulting · GEO Toolkit
        </div>
        {tab === "visibility" ? (
          <>
            <h1 className="text-balance font-display text-4xl sm:text-5xl lg:text-[3.5rem]">
              Are you visible to <em>AI search?</em>
            </h1>
            <p className="mt-5 max-w-[620px] text-balance font-display text-[17px] leading-relaxed text-ink-muted sm:text-[19px]">
              Drop your URL. We run the queries your customers actually ask
              ChatGPT, Perplexity, and Claude — then score how often you show
              up. You get a number, the exact queries you&apos;re missing, and
              which competitors are winning instead.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-balance font-display text-4xl sm:text-5xl lg:text-[3.5rem]">
              Rewrite your page for <em>AI search.</em>
            </h1>
            <p className="mt-5 max-w-[620px] text-balance font-display text-[17px] leading-relaxed text-ink-muted sm:text-[19px]">
              Drop your URL. Get a side-by-side rewrite, FAQ section, and
              JSON-LD schema — all optimized for how AI search engines
              synthesize information.
            </p>
          </>
        )}
      </header>

      <nav className="mb-8 inline-flex items-center gap-1 rounded-xl border border-hairline bg-white p-1 shadow-hairline">
        <button
          onClick={() => setTab("visibility")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "visibility"
              ? "bg-gradient-cta text-white shadow-sm"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          GEO Visibility Checker
        </button>
        <button
          onClick={() => setTab("rewriter")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "rewriter"
              ? "bg-gradient-cta text-white shadow-sm"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          Content Rewriter
        </button>
      </nav>

      {tab === "visibility" ? (
        <VisibilityChecker
          onSendToRewriter={(payload) => {
            setHandoff(payload);
            setTab("rewriter");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : (
        <ContentRewriter
          handoff={handoff}
          onClearHandoff={() => setHandoff(null)}
        />
      )}

      <footer className="mt-24 border-t border-hairline pt-8 text-sm text-ink-muted">
        <p className="max-w-[620px] font-display text-[17px] leading-relaxed">
          This tool gives you the diagnosis. Crescendo Consulting implements
          the full fix — GEO-optimized rewrites, schema deployment, and ongoing
          AI search monitoring.
        </p>
        <a
          href="https://crescendo-consulting.net"
          className="mt-4 inline-block text-sm font-medium text-brand-blue underline underline-offset-4 hover:text-ink"
        >
          See our full GEO package →
        </a>
        <p className="mt-8 max-w-[620px] text-[12px] leading-relaxed text-ink-light">
          Each visibility audit makes ~8 Claude calls and 6 live web searches,
          costing roughly $0.40 in API credits. This demo is rate-limited to 5
          audits per day per IP. No data leaves your browser except the URL,
          industry, and city you submit — audits aren&apos;t logged server-side.
        </p>
      </footer>
    </main>
  );
}
