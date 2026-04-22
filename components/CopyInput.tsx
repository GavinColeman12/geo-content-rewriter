"use client";

import { INDUSTRIES, type Industry } from "@/lib/industryPrompts";

type Props = {
  url: string;
  setUrl: (v: string) => void;
  industry: Industry;
  setIndustry: (v: Industry) => void;
  city: string;
  setCity: (v: string) => void;
  showResearch: boolean;
  setShowResearch: (v: boolean) => void;
  onSubmit: () => void;
  isRunning: boolean;
};

function looksLikeUrl(v: string | undefined): boolean {
  const trimmed = (v ?? "").trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+(\/.*)?$/i.test(trimmed);
}

export function CopyInput({
  url,
  setUrl,
  industry,
  setIndustry,
  city,
  setCity,
  showResearch,
  setShowResearch,
  onSubmit,
  isRunning,
}: Props) {
  const valid = looksLikeUrl(url);
  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-stone-700">
          Paste your website URL
        </label>
        <input
          type="url"
          value={url ?? ""}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="brightsmiledental.com  —  or  —  https://yoursite.com/about"
          className="w-full rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
          disabled={isRunning}
        />
        <p className="mt-1 text-xs text-stone-500">
          We&apos;ll fetch the page, read what&apos;s there, and rewrite it. Point us at the About or Services page for best results — the homepage works too.
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
            placeholder="e.g. Austin, TX  /  Seattle's Capitol Hill"
            className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
            disabled={isRunning}
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
        <input
          type="checkbox"
          checked={showResearch}
          onChange={(e) => setShowResearch(e.target.checked)}
          className="h-4 w-4 rounded border-stone-400 text-stone-900 focus:ring-stone-900/20"
          disabled={isRunning}
        />
        <span className="text-sm text-stone-700">
          Show me the query-coverage audit first — which AI-search queries your page answers well, partially, or misses.
        </span>
      </label>

      <button
        onClick={onSubmit}
        disabled={isRunning || !valid}
        className="w-full rounded-lg bg-stone-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isRunning ? "Working…" : "Scan and rewrite for AI search"}
      </button>
    </div>
  );
}
