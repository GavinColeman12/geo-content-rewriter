export function ResearchPanel({ markdown, isStreaming }: { markdown: string; isStreaming: boolean }) {
  if (!markdown && !isStreaming) return null;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-stone-500">
          Step 1 · Research
        </div>
        {isStreaming && (
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"></span>
            analyzing
          </div>
        )}
      </div>
      <div className="prose prose-sm prose-stone max-w-none whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
        {markdown || "…"}
      </div>
    </div>
  );
}
