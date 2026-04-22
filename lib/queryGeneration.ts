import { getClient, CLAUDE_MODEL } from "@/lib/anthropic";
import type { ScrapeResult } from "@/lib/scraper";
import type { Industry } from "@/lib/industryPrompts";
import { industryContext } from "@/lib/industryPrompts";

export type GeneratedQuery = {
  query: string;
  intent: "research" | "comparison" | "booking";
};

export type BusinessProfile = {
  name: string;
  domain: string;
  city: string;
  services: string[];
};

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function extractBusinessName(scraped: ScrapeResult): string {
  const titleClean = (scraped.title || "")
    .split(/[|\-—–·»]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (titleClean.length > 0) {
    const first = titleClean[0];
    const last = titleClean[titleClean.length - 1];
    const candidates = [first, last];
    for (const c of candidates) {
      if (c.length > 2 && c.length < 60 && !/^home$/i.test(c)) {
        return c;
      }
    }
  }
  if (scraped.h1.length > 0) return scraped.h1[0].slice(0, 60);
  const domain = extractDomain(scraped.finalUrl);
  const name = domain.split(".")[0];
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const GENERATE_SYSTEM = `You generate the queries real customers would ask AI search engines (ChatGPT, Perplexity, Claude, Google AI Overviews) when looking for a local business.

Phrase them exactly how humans type into AI: conversational, specific, often location-grounded. Mix intent stages:
- research (learning about the service)
- comparison (evaluating options)
- booking (ready to buy/book)

Respond with a JSON array only. No preamble. Each item: {"query": string, "intent": "research"|"comparison"|"booking"}.`;

export async function generateQueries(
  scraped: ScrapeResult,
  industry: Industry,
  city: string,
  count: number = 6,
): Promise<{ profile: BusinessProfile; queries: GeneratedQuery[] }> {
  const profile: BusinessProfile = {
    name: extractBusinessName(scraped),
    domain: extractDomain(scraped.finalUrl),
    city: city || "",
    services: scraped.headings.slice(0, 10),
  };

  const userPrompt = [
    `Generate ${count} AI-search queries for this business:`,
    `Name: ${profile.name}`,
    `Industry context:\n${industryContext(industry)}`,
    `Service area: ${city || "(not specified)"}`,
    `Services/topics mentioned on their site: ${profile.services.join(", ") || "(none)"}`,
    ``,
    `Aim for: 2 research, 2 comparison, 2 booking (adjust slightly if needed). Include the city naturally in most queries. Prefer queries that would reveal whether AI surfaces this specific business.`,
    ``,
    `Respond with JSON only — an array of ${count} items.`,
  ].join("\n");

  const client = getClient();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1200,
    system: GENERATE_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Query generation didn't return JSON.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new Error(
      `Query generation returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Query generation didn't return an array.");
  }
  const queries: GeneratedQuery[] = [];
  for (const item of parsed) {
    if (
      item &&
      typeof item === "object" &&
      "query" in item &&
      typeof (item as Record<string, unknown>).query === "string"
    ) {
      const raw = item as { query: string; intent?: string };
      const intent =
        raw.intent === "research" ||
        raw.intent === "comparison" ||
        raw.intent === "booking"
          ? raw.intent
          : "research";
      queries.push({ query: raw.query.trim(), intent });
    }
  }
  if (queries.length === 0) {
    throw new Error("No valid queries generated.");
  }
  return { profile, queries: queries.slice(0, count) };
}
