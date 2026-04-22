import { NextResponse } from "next/server";
import { getClient, CLAUDE_MODEL } from "@/lib/anthropic";
import { GEO_SYSTEM_PROMPT, REWRITE_USER_INSTRUCTIONS } from "@/lib/systemPrompt";
import { INDUSTRIES, industryContext, type Industry } from "@/lib/industryPrompts";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { scrapeUrl, formatScrapedForPrompt } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  url: string;
  industry: Industry;
  city: string;
  targetQueries?: string[];
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { url, industry, city, targetQueries } = body;
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

  let client;
  try {
    client = getClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let scraped;
  try {
    scraped = await scrapeUrl(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const targetQueriesBlock =
    targetQueries && targetQueries.length > 0
      ? [
          `**Priority target queries** — this rewrite MUST make the page surface for these specific AI-search queries the business is currently missing:`,
          ...targetQueries.slice(0, 10).map((q, i) => `${i + 1}. ${q}`),
          ``,
          `Weight the rewrite and FAQ generation heavily toward directly answering these queries. The rewrite should read as if these queries were the exact questions a customer asked the page.`,
        ].join("\n")
      : "";

  const userMessage = [
    `Industry context:\n${industryContext(industry)}`,
    `Service area / city: ${city || "(not specified)"}`,
    targetQueriesBlock,
    `Scraped page:`,
    formatScrapedForPrompt(scraped),
    ``,
    REWRITE_USER_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join("\n\n");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const meta = {
          url: scraped.finalUrl,
          title: scraped.title,
          wordCount: scraped.wordCount,
          h1: scraped.h1,
        };
        controller.enqueue(
          encoder.encode(`\u001E${JSON.stringify(meta)}\u001E`),
        );

        const anthropicStream = client.messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 8000,
          system: GEO_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`\n\n[error] ${msg}`));
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
