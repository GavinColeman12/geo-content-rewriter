import type { EngineResult } from "@/lib/visibilityEngine";

export type CompetitorDomain = {
  domain: string;
  citations: number;
  queriesWonIndices: number[];
};

function hostOfUrl(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

const EXCLUDED_DOMAIN_SUFFIXES = [
  "google.com",
  "maps.google.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "wikipedia.org",
  "yelp.com",
  "reddit.com",
];

function isExcluded(host: string): boolean {
  if (!host) return true;
  for (const sfx of EXCLUDED_DOMAIN_SUFFIXES) {
    if (host === sfx || host.endsWith("." + sfx)) return true;
  }
  return false;
}

export function extractCompetitors(
  results: EngineResult[],
  businessDomain: string,
): CompetitorDomain[] {
  const map = new Map<string, { count: number; queries: Set<number> }>();
  const normalizedBusiness = businessDomain.replace(/^www\./i, "").toLowerCase();

  results.forEach((r, i) => {
    const seenInThisQuery = new Set<string>();
    for (const cit of r.citations) {
      const host = hostOfUrl(cit.url);
      if (!host) continue;
      if (isExcluded(host)) continue;
      if (
        host === normalizedBusiness ||
        host.endsWith("." + normalizedBusiness)
      )
        continue;
      if (seenInThisQuery.has(host)) continue;
      seenInThisQuery.add(host);
      const existing = map.get(host) ?? { count: 0, queries: new Set() };
      existing.count += 1;
      existing.queries.add(i);
      map.set(host, existing);
    }
  });

  return Array.from(map.entries())
    .map(([domain, v]) => ({
      domain,
      citations: v.count,
      queriesWonIndices: Array.from(v.queries).sort((a, b) => a - b),
    }))
    .sort((a, b) =>
      b.citations !== a.citations
        ? b.citations - a.citations
        : a.domain.localeCompare(b.domain),
    )
    .slice(0, 8);
}
