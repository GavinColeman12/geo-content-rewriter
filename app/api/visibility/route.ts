import { NextResponse } from "next/server";
import { getClient, CLAUDE_MODEL } from "@/lib/anthropic";
import {
  INDUSTRIES,
  detectIndustryHeuristic,
  type Industry,
} from "@/lib/industryPrompts";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { scrapeUrl } from "@/lib/scraper";
import { generateQueries } from "@/lib/queryGeneration";
import { runClaudeWebSearch } from "@/lib/visibilityEngine";
import { scoreResults } from "@/lib/visibilityScoring";
import { extractCompetitors } from "@/lib/competitorAnalysis";
import { getMostRecentAuditForUrl, saveAudit } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  url: string;
  industry: Industry;
  city: string;
  autoIndustry?: boolean;
  forceFresh?: boolean;
};

const DELIM = "\u001E";
const CACHE_HOURS = Number(process.env.AUDIT_CACHE_HOURS ?? "24");

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { url, industry, city, autoIndustry, forceFresh } = body;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Please provide a URL." }, { status: 400 });
  }
  if (!INDUSTRIES.find((i) => i.value === industry)) {
    return NextResponse.json({ error: "Invalid industry." }, { status: 400 });
  }
  const ip = getClientIp(req);
  const rate = await checkRateLimit(ip);
  if (!rate.success) {
    return NextResponse.json(
      { error: "Daily rate limit reached (5/day). Try again tomorrow." },
      { status: 429 },
    );
  }

  const encoder = new TextEncoder();
  const send = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: Record<string, unknown>,
  ) => {
    controller.enqueue(encoder.encode(DELIM + JSON.stringify(event) + DELIM));
  };

  // Cache-first: if there's a recent audit for this URL, replay it.
  if (!forceFresh && process.env.DATABASE_URL) {
    try {
      const cached = await getMostRecentAuditForUrl(url, CACHE_HOURS);
      if (cached) {
        const ageMin = Math.round(
          (Date.now() - cached.createdAt.getTime()) / 60000,
        );
        const replay = new ReadableStream({
          async start(controller) {
            send(controller, {
              type: "cached",
              data: {
                id: cached.id,
                ageMinutes: ageMin,
                createdAt: cached.createdAt.toISOString(),
              },
            });
            send(controller, { type: "phase", phase: "scraping" });
            send(controller, { type: "scrape", data: cached.scrapeMeta });
            const det = cached.detection as Record<string, unknown> | null;
            if (det) send(controller, { type: "industry_detected", data: det });
            send(controller, { type: "phase", phase: "generating_queries" });
            send(controller, { type: "profile", data: cached.profile });
            send(controller, { type: "queries", data: cached.queries });
            send(controller, { type: "phase", phase: "running_queries" });
            const res = cached.results as Array<Record<string, unknown>>;
            res.forEach((r, i) =>
              send(controller, { type: "result", index: i, data: r }),
            );
            send(controller, { type: "score", data: cached.score });
            send(controller, { type: "competitors", data: cached.competitors });
            send(controller, { type: "phase", phase: "analyzing" });
            // Replay the stored analysis as a single delta for simplicity.
            if (cached.analysis) {
              send(controller, {
                type: "analysis_delta",
                text: cached.analysis,
              });
            }
            send(controller, { type: "audit_saved", id: cached.id });
            send(controller, { type: "phase", phase: "done" });
            controller.close();
          },
        });
        return new Response(replay, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Audit-Cache": `HIT;age=${ageMin}m;id=${cached.id}`,
          },
        });
      }
    } catch (err) {
      // DB unreachable — fall through to fresh run, don't block the demo.
      console.error("[visibility] cache lookup failed:", err);
    }
  }

  let client;
  try {
    client = getClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const runStartedAt = Date.now();
      try {
        send(controller, { type: "phase", phase: "scraping" });
        const scraped = await scrapeUrl(url);
        const scrapeMeta = {
          url: scraped.finalUrl,
          title: scraped.title,
          wordCount: scraped.wordCount,
          h1: scraped.h1,
        };
        send(controller, { type: "scrape", data: scrapeMeta });

        const detection = detectIndustryHeuristic(
          [scraped.title, scraped.h1.join(" "), scraped.bodyText].join("\n"),
        );
        const effectiveIndustry: Industry =
          autoIndustry && detection.confidence !== "low"
            ? detection.industry
            : industry;
        const source: "user" | "detected" =
          autoIndustry && detection.confidence !== "low" ? "detected" : "user";
        const detectionPayload = {
          detected: detection.industry,
          confidence: detection.confidence,
          used: effectiveIndustry,
          source,
        };
        send(controller, {
          type: "industry_detected",
          data: detectionPayload,
        });

        send(controller, { type: "phase", phase: "generating_queries" });
        const { profile, queries } = await generateQueries(
          scraped,
          effectiveIndustry,
          city,
          6,
        );
        send(controller, { type: "profile", data: profile });
        send(controller, { type: "queries", data: queries });

        send(controller, { type: "phase", phase: "running_queries" });

        const resultPayloads: Array<Record<string, unknown>> = new Array(
          queries.length,
        ).fill(null);
        const engineTasks = queries.map(async (q, idx) => {
          const result = await runClaudeWebSearch(q.query, profile);
          const payload = {
            query: q.query,
            intent: q.intent,
            engine: result.engine,
            answerText: result.answerText,
            citations: result.citations.slice(0, 8),
            presence: result.presence,
            error: result.error,
          };
          resultPayloads[idx] = payload;
          send(controller, { type: "result", index: idx, data: payload });
          return result;
        });
        const results = await Promise.all(engineTasks);

        const score = scoreResults(results, queries);
        send(controller, { type: "score", data: score });

        const competitors = extractCompetitors(results, profile.domain);
        send(controller, { type: "competitors", data: competitors });

        send(controller, { type: "phase", phase: "analyzing" });

        const summaryInput = results.map((r, i) => ({
          queryNumber: i + 1,
          query: r.query,
          verdict: r.presence.verdict,
          citedDomains: Array.from(
            new Set(
              r.citations
                .map((c) => {
                  try {
                    return new URL(c.url).hostname.replace(/^www\./i, "");
                  } catch {
                    return "";
                  }
                })
                .filter(Boolean),
            ),
          ).slice(0, 5),
          answerExcerpt: r.answerText.slice(0, 250),
        }));
        const competitorSummary = competitors.slice(0, 5).map((c) => ({
          domain: c.domain,
          citationsInYourAudit: c.citations,
          queriesTheyWon: c.queriesWonIndices.map((i) => i + 1),
        }));

        const analysisPrompt = [
          `Business: ${profile.name}`,
          `Domain: ${profile.domain}`,
          `Location: ${profile.city}`,
          ``,
          `Visibility score: ${score.overall}/100 — ${score.bandLabel}`,
          `Hits: ${score.hitCount} · Partial: ${score.partialCount} · Missed: ${score.missCount}`,
          ``,
          `Per-query results:`,
          JSON.stringify(summaryInput, null, 2),
          ``,
          `Top competitor domains cited in this audit (excluding you):`,
          JSON.stringify(competitorSummary, null, 2),
          ``,
          `Write a GEO visibility analysis in this exact structure, using plain markdown. When you reference a specific query, always use its queryNumber (1-indexed) — e.g. "Query 3", not "Query 2".`,
          ``,
          `## Headline`,
          `One sentence — the punchline of this audit.`,
          ``,
          `## Where the business is winning`,
          `2-3 bullets tied to specific queries that hit. If zero hits, write "Nothing surfaced — this business is invisible to AI search right now."`,
          ``,
          `## Who's winning instead`,
          `2-3 bullets naming the competitor domains being cited for the missed queries. Call out the pattern — are directory sites winning? A specific competitor? National chains?`,
          ``,
          `## The three highest-ROI fixes`,
          `Three specific, numbered fixes — tied to the missed queries and the competitor patterns. Not generic advice.`,
          ``,
          `No preamble. No closing summary.`,
        ].join("\n");

        let analysisBuf = "";
        const anthropicStream = client.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 1500,
          messages: [{ role: "user", content: analysisPrompt }],
        });
        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            analysisBuf += event.delta.text;
            send(controller, {
              type: "analysis_delta",
              text: event.delta.text,
            });
          }
        }

        // Persist the audit. If DB is missing or fails, don't block the response.
        if (process.env.DATABASE_URL) {
          try {
            const id = await saveAudit({
              url,
              industry: effectiveIndustry,
              city: city || null,
              autoIndustry: !!autoIndustry,
              detection: detectionPayload,
              scrapeMeta,
              profile,
              queries,
              results: resultPayloads,
              score,
              competitors,
              analysis: analysisBuf,
              durationMs: Date.now() - runStartedAt,
              clientIp: ip,
            });
            send(controller, { type: "audit_saved", id });
          } catch (err) {
            console.error("[visibility] saveAudit failed:", err);
          }
        }

        send(controller, { type: "phase", phase: "done" });
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send(controller, { type: "error", message: msg });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-RateLimit-Remaining": String(rate.remaining),
    },
  });
}
