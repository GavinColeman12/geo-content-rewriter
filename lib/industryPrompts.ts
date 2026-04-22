export type Industry =
  | "dental"
  | "medical"
  | "law_firm"
  | "medspa"
  | "home_services"
  | "other";

export function detectIndustryHeuristic(text: string): {
  industry: Industry;
  confidence: "high" | "medium" | "low";
} {
  const t = text.toLowerCase();
  const score = {
    dental: 0,
    medical: 0,
    law_firm: 0,
    medspa: 0,
    home_services: 0,
  };
  const kw = (arr: string[], key: keyof typeof score, w = 1) => {
    for (const k of arr) {
      if (t.includes(k)) score[key] += w;
    }
  };
  kw(
    ["dentist", "dental", "orthodontist", "invisalign", "teeth", "tooth", "hygienist", "crown", "filling", "cavity"],
    "dental",
    2,
  );
  kw(
    [
      "botox",
      "filler",
      "medspa",
      "med spa",
      "aesthetic",
      "coolsculpting",
      "laser hair",
      "chemical peel",
      "microneedling",
    ],
    "medspa",
    2,
  );
  kw(
    [
      "attorney",
      "lawyer",
      "law firm",
      "legal",
      "litigation",
      "plaintiff",
      "defendant",
      "personal injury",
      "divorce attorney",
      "estate planning",
    ],
    "law_firm",
    2,
  );
  kw(
    [
      "plumber",
      "plumbing",
      "hvac",
      "air conditioning",
      "electrician",
      "roofing",
      "roofer",
      "water heater",
      "furnace",
      "emergency plumber",
    ],
    "home_services",
    2,
  );
  kw(
    [
      "doctor",
      "physician",
      "clinic",
      "primary care",
      "pediatric",
      "medical practice",
      "urgent care",
      "family medicine",
      "annual physical",
    ],
    "medical",
    2,
  );
  kw(["general dentistry", "cosmetic dentistry", "family dentist"], "dental", 1);
  kw(["cosmetic injections", "dermal filler"], "medspa", 1);

  const entries = Object.entries(score) as Array<[keyof typeof score, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [top, second] = entries;
  if (!top || top[1] === 0) {
    return { industry: "other", confidence: "low" };
  }
  const confidence =
    top[1] >= 6 && top[1] >= (second?.[1] ?? 0) * 2
      ? "high"
      : top[1] >= 3
        ? "medium"
        : "low";
  return { industry: top[0] as Industry, confidence };
}

export const INDUSTRIES: { value: Industry; label: string }[] = [
  { value: "dental", label: "Dental Practice" },
  { value: "medical", label: "Medical / Clinic" },
  { value: "law_firm", label: "Law Firm" },
  { value: "medspa", label: "Medspa / Aesthetics" },
  { value: "home_services", label: "Home Services" },
  { value: "other", label: "Other" },
];

export function industryContext(industry: Industry): string {
  switch (industry) {
    case "dental":
      return [
        "Business type: Dental practice.",
        "Common AI-search questions: 'best family dentist near me', 'dental cleaning cost without insurance', 'what to expect at first dental visit', 'do you take my insurance', 'emergency dentist same day', 'Invisalign vs braces cost', 'wisdom tooth removal recovery time'.",
        "Schema subtype: Dentist (schema.org/Dentist, a MedicalBusiness).",
        "Compliance: avoid specific outcome guarantees; general educational info only.",
      ].join("\n");
    case "medical":
      return [
        "Business type: Medical practice or clinic.",
        "Common AI-search questions: 'primary care doctor accepting new patients', 'same-day sick visit near me', 'annual physical cost', 'do you take [insurance]', 'what should I bring to my first appointment', 'telehealth options', 'pediatric care hours'.",
        "Schema subtype: MedicalClinic or Physician (schema.org/MedicalClinic).",
        "Compliance: HIPAA-aware; no diagnostic claims; keep disclaimers intact.",
      ].join("\n");
    case "law_firm":
      return [
        "Business type: Law firm or solo attorney.",
        "Common AI-search questions: 'personal injury lawyer free consultation', 'how much does a divorce attorney cost', 'what to do after a car accident', 'do I have a case', 'contingency fee vs hourly', 'statute of limitations in [state]', 'when should I hire a lawyer'.",
        "Schema subtype: LegalService (schema.org/LegalService).",
        "Compliance: no outcome guarantees; include 'prior results do not guarantee future outcomes' disclaimers where they exist; avoid unauthorized-practice language.",
      ].join("\n");
    case "medspa":
      return [
        "Business type: Medspa or aesthetics clinic.",
        "Common AI-search questions: 'Botox cost per unit near me', 'how long does filler last', 'laser hair removal number of sessions', 'chemical peel recovery time', 'free consultation medspa', 'is CoolSculpting worth it'.",
        "Schema subtype: MedicalBusiness (schema.org/MedicalBusiness).",
        "Compliance: no outcome guarantees; keep medical-supervision disclosures intact.",
      ].join("\n");
    case "home_services":
      return [
        "Business type: Home services (HVAC, plumbing, electrical, roofing, etc.).",
        "Common AI-search questions: '24 hour plumber near me', 'how much does HVAC replacement cost', 'emergency electrician same day', 'is my water heater leaking dangerous', 'licensed and insured', 'free estimate', 'service area'.",
        "Schema subtype: HomeAndConstructionBusiness or specific subtype (e.g., Plumber, HVACBusiness, Electrician, RoofingContractor).",
        "Compliance: keep licensing and insurance claims factual.",
      ].join("\n");
    default:
      return [
        "Business type: General local business.",
        "Schema subtype: LocalBusiness (schema.org/LocalBusiness).",
      ].join("\n");
  }
}
