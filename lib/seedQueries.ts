import type { Industry } from "@/lib/industryPrompts";
import type { GeneratedQuery } from "@/lib/queryGeneration";

// High-intent AI-search queries that consistently matter for each industry.
// These are stable across runs, so changes in score have a real signal, not
// just query-drift noise. Placeholders {city} and {name} are filled in.

type SeedTemplate = { template: string; intent: GeneratedQuery["intent"] };

const SEED_TEMPLATES: Record<Industry, SeedTemplate[]> = {
  dental: [
    {
      template: "best family dentist in {city} accepting new patients",
      intent: "comparison",
    },
    {
      template: "how much does a dental cleaning cost in {city} without insurance",
      intent: "research",
    },
    {
      template: "book a dental checkup near {city} this week",
      intent: "booking",
    },
  ],
  medical: [
    {
      template: "primary care doctor in {city} accepting new patients",
      intent: "comparison",
    },
    {
      template: "same-day sick visit clinic in {city}",
      intent: "booking",
    },
    {
      template: "what to bring to a first primary care appointment in {city}",
      intent: "research",
    },
  ],
  law_firm: [
    {
      template: "best personal injury attorney in {city} free consultation",
      intent: "comparison",
    },
    {
      template: "how much does a divorce attorney cost in {city}",
      intent: "research",
    },
    {
      template: "when should I hire a lawyer after a car accident in {city}",
      intent: "booking",
    },
  ],
  medspa: [
    {
      template: "Botox cost per unit in {city}",
      intent: "research",
    },
    {
      template: "best medspa in {city} for first-time filler",
      intent: "comparison",
    },
    {
      template: "book a free medspa consultation in {city}",
      intent: "booking",
    },
  ],
  home_services: [
    {
      template: "24 hour emergency plumber in {city}",
      intent: "booking",
    },
    {
      template: "how much does HVAC replacement cost in {city}",
      intent: "research",
    },
    {
      template: "licensed and insured contractor in {city} free estimate",
      intent: "comparison",
    },
  ],
  other: [
    {
      template: "best {name} alternatives in {city}",
      intent: "comparison",
    },
    {
      template: "how to choose a provider like {name} in {city}",
      intent: "research",
    },
    {
      template: "contact {name} in {city}",
      intent: "booking",
    },
  ],
};

export function getSeedQueries(
  industry: Industry,
  city: string,
  name: string,
): GeneratedQuery[] {
  const templates = SEED_TEMPLATES[industry] ?? SEED_TEMPLATES.other;
  const normalizedCity = city?.trim() || "your area";
  return templates.map((t) => ({
    query: t.template
      .replace(/\{city\}/g, normalizedCity)
      .replace(/\{name\}/g, name || "a provider"),
    intent: t.intent,
  }));
}
