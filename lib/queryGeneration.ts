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

export type LLMBusinessId = {
  name: string | null;
  industry: Industry;
  industryConfidence: "high" | "medium" | "low";
  businessType: string; // free-form, e.g. "online training course", "SaaS product", "dental practice"
  isLocalServiceBusiness: boolean;
};

async function identifyBusinessWithLLM(
  scraped: ScrapeResult,
  domain: string,
): Promise<LLMBusinessId | null> {
  const client = getClient();
  const prompt = [
    "You are classifying a website for a GEO (Generative Engine Optimization) audit tool.",
    "",
    "Return ONLY a JSON object with these fields:",
    "  name              - the business/entity/product name (string) or null if unclear",
    "  industry          - one of: dental, medical, law_firm, medspa, home_services, other",
    "  industryConfidence - high | medium | low",
    "  businessType      - short free-form description, e.g. \"dental practice\", \"personal injury law firm\", \"online training course\", \"SaaS product\", \"e-commerce brand\", \"news blog\"",
    "  isLocalServiceBusiness - true only if customers pick providers by physical location (dentist, lawyer, plumber, doctor, medspa, restaurant, etc). false for online courses, SaaS, e-commerce, media, national brands.",
    "",
    "Use industry = 'other' whenever the business does NOT fit dental/medical/law_firm/medspa/home_services. Use industryConfidence = 'low' only when the content is too sparse or ambiguous to tell at all.",
    "",
    `Domain: ${domain}`,
    `<title>: ${scraped.title}`,
    scraped.h1.length ? `<h1>: ${scraped.h1.join(" | ")}` : "",
    `First 800 chars of body text:\n${scraped.bodyText.slice(0, 800)}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const validIndustries: Industry[] = [
      "dental",
      "medical",
      "law_firm",
      "medspa",
      "home_services",
      "other",
    ];
    const industry: Industry = validIndustries.includes(parsed.industry)
      ? parsed.industry
      : "other";
    const conf =
      parsed.industryConfidence === "high" ||
      parsed.industryConfidence === "medium" ||
      parsed.industryConfidence === "low"
        ? parsed.industryConfidence
        : "low";
    const name =
      typeof parsed.name === "string" && parsed.name.length > 0 && parsed.name.length < 80
        ? parsed.name
        : null;
    return {
      name,
      industry,
      industryConfidence: conf,
      businessType:
        typeof parsed.businessType === "string"
          ? parsed.businessType.slice(0, 80)
          : "",
      isLocalServiceBusiness: Boolean(parsed.isLocalServiceBusiness),
    };
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

export type QueryGenOptions = {
  /** Effective industry the caller wants seeds for. If the LLM later
   * identifies this as "other" or low-confidence / non-local, seeds are
   * skipped regardless and 6 custom queries are generated. */
  industry: Industry;
  city: string;
  count?: number;
};

export async function generateQueries(
  scraped: ScrapeResult,
  opts: QueryGenOptions | Industry,
  cityArg?: string,
  countArg: number = 6,
): Promise<{
  profile: BusinessProfile;
  queries: GeneratedQuery[];
  identification: LLMBusinessId | null;
  effectiveIndustry: Industry;
}> {
  // Back-compat: also accept the original (industry, city, count) signature.
  const options: QueryGenOptions =
    typeof opts === "string"
      ? { industry: opts, city: cityArg ?? "", count: countArg }
      : { count: 6, ...opts };
  const industry = options.industry;
  const city = options.city;
  const count = options.count ?? 6;

  const domain = extractDomain(scraped.finalUrl);
  const heuristicName = extractBusinessNameHeuristic(scraped);
  const identification = await identifyBusinessWithLLM(scraped, domain);
  const name = identification?.name || heuristicName;
  // Use LLM-identified industry when confidence is at least medium, else
  // respect the caller's industry (user selection or heuristic fallback).
  const effectiveIndustry: Industry =
    identification && identification.industryConfidence !== "low"
      ? identification.industry
      : industry;

  const profile: BusinessProfile = {
    name,
    domain,
    city: city || "",
    services: scraped.headings.slice(0, 10),
  };

  // Seeds only apply when:
  //   - The identified industry is a local-service bucket we have seeds for, AND
  //   - The LLM is at least medium-confident this is a local service business
  // For "other" (online courses, SaaS, ecommerce, media) or low-confidence
  // scraped pages, skip seeds entirely and let Claude generate all 6 queries
  // tailored to the actual business. This is what makes an audit of a site
  // like "Ministry of Freedom" produce Ministry-of-Freedom-specific queries
  // instead of dental defaults.
  const seedsApply =
    effectiveIndustry !== "other" &&
    (!identification ||
      (identification.industryConfidence !== "low" &&
        identification.isLocalServiceBusiness));

  const seeds = seedsApply
    ? getSeedQueries(effectiveIndustry, profile.city, profile.name)
    : [];
  const seedCount = Math.min(seeds.length, Math.floor(count / 2));
  const customCount = Math.max(1, count - seedCount);

  const businessTypeLine = identification?.businessType
    ? `Business type: ${identification.businessType}`
    : "";
  const locationLine = identification?.isLocalServiceBusiness
    ? `Service area: ${city || "(not specified)"}`
    : city
      ? `Location context (if relevant): ${city}`
      : "";

  const instructionBlock = seedsApply
    ? [
        `Generate ${customCount} AI-search queries. These will be combined with ${seedCount} standard ${effectiveIndustry} queries already covering generic intent. Your ${customCount} queries should be SPECIFIC to this business's actual services/topics — don't duplicate the generic patterns below:`,
        ...seeds.slice(0, seedCount).map((s, i) => `${i + 1}. ${s.query}`),
        ``,
        `Mix intents: research (how-does-this-work questions), comparison (best-X-in-Y), booking (ready-to-buy).`,
      ].join("\n")
    : [
        `Generate ${customCount} AI-search queries that real potential customers would ask ChatGPT/Perplexity/Claude when looking for a business like this one. Ground every query in the business's actual name, product, and service details — not generic industry patterns.`,
        ``,
        identification?.isLocalServiceBusiness
          ? `Include location context where natural.`
          : `This is NOT a location-picked-by-address business. Do NOT include "near me" or city names unless they're central to the offer. Queries should focus on the product/service itself.`,
        ``,
        `Mix intents across 2 research (learning about the product/service), 2 comparison (evaluating vs alternatives), and 2 booking (ready-to-buy/sign-up) queries.`,
      ].join("\n");

  const userPrompt = [
    `Generate queries for this business:`,
    `Name: ${profile.name}`,
    businessTypeLine,
    effectiveIndustry !== "other"
      ? `Industry context:\n${industryContext(effectiveIndustry)}`
      : "",
    locationLine,
    `Services/topics mentioned on their site: ${profile.services.join(", ") || "(none)"}`,
    ``,
    instructionBlock,
    ``,
    `Respond with JSON only — an array of ${customCount} items: {"query": string, "intent": "research"|"comparison"|"booking"}.`,
  ]
    .filter(Boolean)
    .join("\n");

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
  return {
    profile,
    queries: merged.slice(0, count),
    identification,
    effectiveIndustry,
  };
}
