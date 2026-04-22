import { getClient, CLAUDE_MODEL } from "@/lib/anthropic";
import type { BusinessProfile } from "@/lib/queryGeneration";

export type EngineName = "claude_web_search";

export type Citation = {
  url: string;
  title: string;
};

export type EngineResult = {
  engine: EngineName;
  query: string;
  answerText: string;
  citations: Citation[];
  presence: Presence;
  error?: string;
};

export type Presence = {
  inCitations: boolean;
  inAnswerText: boolean;
  verdict: "hit" | "partial" | "miss";
  matchedCitationUrls: string[];
};

function domainOfUrl(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function evaluatePresence(
  result: Omit<EngineResult, "presence">,
  profile: BusinessProfile,
): Presence {
  const matchedCitationUrls: string[] = [];
  const domain = profile.domain;
  for (const cit of result.citations) {
    const cd = domainOfUrl(cit.url);
    if (cd && domain && (cd === domain || cd.endsWith("." + domain))) {
      matchedCitationUrls.push(cit.url);
    }
  }
  const inCitations = matchedCitationUrls.length > 0;

  const name = profile.name.trim();
  const nameRe =
    name.length >= 3
      ? new RegExp(`\\b${escapeRegex(name)}\\b`, "i")
      : null;
  const inAnswerText = nameRe ? nameRe.test(result.answerText) : false;

  const verdict: Presence["verdict"] = inCitations
    ? "hit"
    : inAnswerText
      ? "partial"
      : "miss";

  return { inCitations, inAnswerText, verdict, matchedCitationUrls };
}

const ENGINE_SYSTEM = `You are answering a consumer's query using live web search. Search the web, read the most relevant sources, then write a direct helpful answer the way ChatGPT or Perplexity would. Cite sources.

Keep the answer to 3-5 sentences. No preamble. Focus on local, specific, actionable information.`;

export async function runClaudeWebSearch(
  query: string,
  profile: BusinessProfile,
): Promise<EngineResult> {
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1500,
      system: ENGINE_SYSTEM,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        } as never,
      ],
      messages: [{ role: "user", content: query }],
    });

    let answerText = "";
    const citations: Citation[] = [];
    const seenUrls = new Set<string>();

    for (const block of response.content) {
      if (block.type === "text") {
        answerText += block.text;
        const citationsAny = (block as unknown as { citations?: unknown })
          .citations;
        if (Array.isArray(citationsAny)) {
          for (const c of citationsAny) {
            if (
              c &&
              typeof c === "object" &&
              "url" in c &&
              typeof (c as Record<string, unknown>).url === "string"
            ) {
              const url = (c as { url: string }).url;
              const title =
                typeof (c as Record<string, unknown>).title === "string"
                  ? ((c as { title: string }).title)
                  : url;
              if (!seenUrls.has(url)) {
                seenUrls.add(url);
                citations.push({ url, title });
              }
            }
          }
        }
      } else if (
        (block as { type: string }).type === "web_search_tool_result"
      ) {
        const content = (block as unknown as { content?: unknown }).content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (
              item &&
              typeof item === "object" &&
              "url" in item &&
              typeof (item as Record<string, unknown>).url === "string"
            ) {
              const url = (item as { url: string }).url;
              const title =
                typeof (item as Record<string, unknown>).title === "string"
                  ? (item as { title: string }).title
                  : url;
              if (!seenUrls.has(url)) {
                seenUrls.add(url);
                citations.push({ url, title });
              }
            }
          }
        }
      }
    }

    const partial: Omit<EngineResult, "presence"> = {
      engine: "claude_web_search",
      query,
      answerText: answerText.trim(),
      citations,
    };
    return { ...partial, presence: evaluatePresence(partial, profile) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const partial: Omit<EngineResult, "presence"> = {
      engine: "claude_web_search",
      query,
      answerText: "",
      citations: [],
      error: msg,
    };
    return {
      ...partial,
      presence: {
        inCitations: false,
        inAnswerText: false,
        verdict: "miss",
        matchedCitationUrls: [],
      },
    };
  }
}
