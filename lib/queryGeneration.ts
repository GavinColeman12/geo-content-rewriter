import { getClient, CLAUDE_MODEL } from "@/lib/anthropic";
import type { ScrapeResult } from "@/lib/scraper";
import type { Industry } from "@/lib/industryPrompts";
import { industryContext } from "@/lib/industryPrompts";
import { getSeedQueries } from "@/lib/seedQueries";

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

function extractBusinessNameHeuristic(scraped: ScrapeResult): string {
  const domain = extractDomain(scraped.finalUrl);
  const slug = domain.split(".")[0].replace(/-/g, " ");
  const titleParts = (scraped.title || "")
    .split(/[|\-—–·»]/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Prefer the title segment whose slugified form matches the domain slug.
  if (titleParts.length > 1) {
    for (const p of titleParts) {
      const normalizedP = p.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (
        normalizedP &&
        normalizedSlug &&
        (normalizedP.includes(normalizedSlug) ||
          normalizedSlug.includes(normalizedP))
      ) {
        return p;
      }
    }
  }
  if (titleParts[0] && titleParts[0].length > 2 && titleParts[0].length < 60) {
    return titleParts[0];
  }
  if (scraped.h1.length > 0) return scraped.h1[0].slice(0, 60);
  return slug.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function extractBusinessNameWithLLM(
  scraped: ScrapeResult,
  domain: string,
): Promise<string | null> {
  const client = getClient();
  const prompt = [
    "Identify the business name of the entity that owns this website. Return ONLY the name, nothing else. No quotes, no preamble.",
    "",
    `Domain: ${domain}`,
    `<title>: ${scraped.title}`,
    scraped.h1.length ? `<h1>: ${scraped.h1.join(" | ")}` : "",
    `First 400 chars of body text:\n${scraped.bodyText.slice(0, 400)}`,
    "",
    'If you cannot identify it, respond with exactly: UNKNOWN',
  ].filter(Boolean).join("\n");

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 60,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!text || text === "UNKNOWN" || text.length > 80) return null;
    return text;
  } catch {
    return null;
  }
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
  const domain = extractDomain(scraped.finalUrl);
  const heuristicName = extractBusinessNameHeuristic(scraped);
  const llmName = await extractBusinessNameWithLLM(scraped, domain);
  const name = llmName || heuristicName;
  const profile: BusinessProfile = {
    name,
    domain,
    city: city || "",
    services: scraped.headings.slice(0, 10),
  };

  // Half of the query slots are industry-standard seed queries — stable
  // across runs so score changes reflect content changes, not query drift.
  // The remaining slots are Claude-generated, specific to this business's
  // actual service/topic mix so blind spots don't slip through.
  const seeds = getSeedQueries(industry, profile.city, profile.name);
  const seedCount = Math.min(seeds.length, Math.floor(count / 2));
  const customCount = Math.max(1, count - seedCount);

  const userPrompt = [
    `Generate ${customCount} AI-search queries for this business:`,
    `Name: ${profile.name}`,
    `Industry context:\n${industryContext(industry)}`,
    `Service area: ${city || "(not specified)"}`,
    `Services/topics mentioned on their site: ${profile.services.join(", ") || "(none)"}`,
    ``,
    `These queries will be combined with ${seedCount} standard industry queries already covering generic intent. Your ${customCount} queries should be SPECIFIC to this business's actual services/topics above — don't duplicate the generic patterns below:`,
    ...seeds.slice(0, seedCount).map((s, i) => `${i + 1}. ${s.query}`),
    ``,
    `Mix intents: research (how-does-this-work questions), comparison (best-X-in-Y), booking (ready-to-buy). Include the city naturally where relevant.`,
    ``,
    `Respond with JSON only — an array of ${customCount} items.`,
  ].join("\n");

  const client = getClient();
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
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
  if (queries.length === 0 && seedCount === 0) {
    throw new Error("No valid queries generated.");
  }

  // Interleave: seeds first (establish the baseline), then custom, to keep
  // the query order deterministic-feeling across runs.
  const merged: GeneratedQuery[] = [
    ...seeds.slice(0, seedCount),
    ...queries.slice(0, customCount),
  ];
  return { profile, queries: merged.slice(0, count) };
}
