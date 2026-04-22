import type { EngineResult } from "@/lib/visibilityEngine";

export type Score = {
  overall: number;
  hitCount: number;
  partialCount: number;
  missCount: number;
  errorCount: number;
  total: number;
  band: "strong" | "moderate" | "weak" | "invisible";
  bandLabel: string;
};

export function scoreResults(results: EngineResult[]): Score {
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

  return {
    overall,
    hitCount,
    partialCount,
    missCount,
    errorCount,
    total,
    band,
    bandLabel,
  };
}
