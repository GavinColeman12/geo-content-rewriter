"use client";

import { useState } from "react";
import { VisibilityChecker } from "@/components/VisibilityChecker";
import { ContentRewriter } from "@/components/ContentRewriter";

type Tab = "visibility" | "rewriter";

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("visibility");

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          Crescendo Consulting · GEO Toolkit
        </div>
        {tab === "visibility" ? (
          <>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              Are you visible to AI search?
            </h1>
            <p className="mt-4 max-w-2xl text-balance text-base leading-relaxed text-stone-600">
              Drop your URL. We run the queries your customers actually ask
              ChatGPT, Perplexity, and Claude — then score how often you show
              up. You get a number, the exact queries you&apos;re missing, and
              which competitors are winning instead.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              Rewrite your page for AI search.
            </h1>
            <p className="mt-4 max-w-2xl text-balance text-base leading-relaxed text-stone-600">
              Drop your URL. Get a side-by-side rewrite, FAQ section, and
              JSON-LD schema — all optimized for how AI search engines
              synthesize information.
            </p>
          </>
        )}
      </header>

      <nav className="mb-8 flex items-center gap-1 rounded-xl border border-stone-200 bg-white p-1 shadow-sm sm:w-fit">
        <button
          onClick={() => setTab("visibility")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-initial ${
            tab === "visibility"
              ? "bg-stone-900 text-white shadow-sm"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          GEO Visibility Checker
        </button>
        <button
          onClick={() => setTab("rewriter")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-initial ${
            tab === "rewriter"
              ? "bg-stone-900 text-white shadow-sm"
              : "text-stone-600 hover:text-stone-900"
          }`}
        >
          Content Rewriter
        </button>
      </nav>

      {tab === "visibility" ? <VisibilityChecker /> : <ContentRewriter />}

      <footer className="mt-20 border-t border-stone-200 pt-8 text-sm text-stone-600">
        <p className="max-w-2xl">
          This tool gives you the diagnosis. Crescendo Consulting implements
          the full fix — GEO-optimized rewrites, schema deployment, and ongoing
          AI search monitoring.
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
