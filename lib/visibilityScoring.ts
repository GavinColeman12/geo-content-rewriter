import type { EngineResult } from "@/lib/visibilityEngine";
import type { GeneratedQuery } from "@/lib/queryGeneration";

export type IntentBreakdown = {
  intent: "research" | "comparison" | "booking";
  total: number;
  hits: number;
  partials: number;
  misses: number;
  score: number;
};

export type Score = {
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

export function scoreResults(
  results: EngineResult[],
  queries: GeneratedQuery[] = [],
): Score {
  const total = results.length;
  let hitCount = 0;
  let partialCount = 0;
  let missCount = 0;
  let errorCount = 0;
  let weighted = 0;
  for (const r of results) {
    if (r.error) errorCount++;
    switch (r.presence.verdict) {
      case "hit":
        hitCount++;
        weighted += 1;
        break;
      case "partial":
        partialCount++;
        weighted += 0.5;
        break;
      case "miss":
        missCount++;
        break;
    }
  }
  const denom = Math.max(1, total - errorCount);
  const overall = Math.round((weighted / denom) * 100);

  let band: Score["band"];
  let bandLabel: string;
  if (overall >= 70) {
    band = "strong";
    bandLabel = "Strong AI visibility";
  } else if (overall >= 40) {
    band = "moderate";
    bandLabel = "Moderate — room to grow";
  } else if (overall >= 15) {
    band = "weak";
    bandLabel = "Weak — you're getting missed";
  } else {
    band = "invisible";
    bandLabel = "Invisible to AI search";
  }

  const intents: Array<IntentBreakdown["intent"]> = [
    "research",
    "comparison",
    "booking",
  ];
  const byIntent: IntentBreakdown[] = intents
    .map((intent) => {
      const indices = queries
        .map((q, i) => (q.intent === intent ? i : -1))
        .filter((i) => i !== -1);
      let hits = 0;
      let partials = 0;
      let misses = 0;
      let weighted = 0;
      let valid = 0;
      for (const i of indices) {
        const r = results[i];
        if (!r || r.error) continue;
        valid++;
        if (r.presence.verdict === "hit") {
          hits++;
          weighted += 1;
        } else if (r.presence.verdict === "partial") {
          partials++;
          weighted += 0.5;
        } else {
          misses++;
        }
      }
      const intentScore =
        valid > 0 ? Math.round((weighted / valid) * 100) : 0;
      return {
        intent,
        total: indices.length,
        hits,
        partials,
        misses,
        score: intentScore,
      };
    })
    .filter((b) => b.total > 0);

  return {
    overall,
    hitCount,
    partialCount,
    missCount,
    errorCount,
    total,
    band,
    bandLabel,
    byIntent,
  };
}
