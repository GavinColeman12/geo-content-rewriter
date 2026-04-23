import { ParagraphPair, renderHighlights } from "@/lib/parseRewrite";

export function BeforeAfterCompare({ pairs }: { pairs: ParagraphPair[] }) {
  if (pairs.length === 0) return null;
  return (
    <div className="space-y-6">
      {pairs.map((pair, idx) => (
        <div
          key={idx}
          className="grid grid-cols-1 gap-4 rounded-xl border border-hairline bg-white p-5 md:grid-cols-2"
        >
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-light">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink-light"></span>
              Original
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
              {pair.original}
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
              Rewritten for AI search
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {renderHighlights(pair.rewritten).map((part, i) =>
                part.type === "highlight" ? (
                  <span key={i} className="diff-highlight">
                    {part.text}
                  </span>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
