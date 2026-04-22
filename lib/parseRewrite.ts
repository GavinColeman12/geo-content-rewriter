export type ParagraphPair = { original: string; rewritten: string };
export type Faq = { question: string; answer: string };

export type RewriteResult = {
  pairs: ParagraphPair[];
  faqs: Faq[];
  schemaRaw: string;
  schemaJson: string;
  explanation: string;
};

function extractSection(markdown: string, heading: string, nextHeadings: string[]): string {
  const start = markdown.indexOf(heading);
  if (start === -1) return "";
  const afterHeading = start + heading.length;
  let end = markdown.length;
  for (const h of nextHeadings) {
    const idx = markdown.indexOf(h, afterHeading);
    if (idx !== -1 && idx < end) end = idx;
  }
  return markdown.slice(afterHeading, end).trim();
}

export function parseRewriteOutput(markdown: string): RewriteResult {
  const rewriteBlock = extractSection(markdown, "### REWRITE", [
    "### FAQS",
    "### SCHEMA",
    "### EXPLANATION",
  ]);
  const faqsBlock = extractSection(markdown, "### FAQS", [
    "### SCHEMA",
    "### EXPLANATION",
  ]);
  const schemaBlock = extractSection(markdown, "### SCHEMA", ["### EXPLANATION"]);
  const explanation = extractSection(markdown, "### EXPLANATION", []);

  const pairs: ParagraphPair[] = [];
  const entries = rewriteBlock
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const origMatch = entry.match(/ORIGINAL:\s*([\s\S]*?)(?=\n\s*REWRITTEN:|$)/);
    const rewMatch = entry.match(/REWRITTEN:\s*([\s\S]*?)$/);
    if (origMatch && rewMatch) {
      pairs.push({
        original: origMatch[1].trim(),
        rewritten: rewMatch[1].trim(),
      });
    }
  }

  const faqs: Faq[] = [];
  const faqEntries = faqsBlock.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const entry of faqEntries) {
    const qMatch = entry.match(/Q:\s*([\s\S]*?)(?=\n\s*A:|$)/);
    const aMatch = entry.match(/A:\s*([\s\S]*?)$/);
    if (qMatch && aMatch) {
      faqs.push({ question: qMatch[1].trim(), answer: aMatch[1].trim() });
    }
  }

  const fenceMatch = schemaBlock.match(/```json\s*([\s\S]*?)```/i);
  const schemaJson = fenceMatch ? fenceMatch[1].trim() : "";

  return {
    pairs,
    faqs,
    schemaRaw: schemaBlock,
    schemaJson,
    explanation,
  };
}

export function renderHighlights(text: string): Array<{ type: "plain" | "highlight"; text: string }> {
  const parts: Array<{ type: "plain" | "highlight"; text: string }> = [];
  const regex = /==([^=]+)==/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ type: "plain", text: text.slice(lastIdx, match.index) });
    }
    parts.push({ type: "highlight", text: match[1] });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ type: "plain", text: text.slice(lastIdx) });
  }
  return parts;
}
