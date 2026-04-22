export function ChangeExplanation({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-800">
        What changed and why
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
        {text}
      </div>
    </div>
  );
}
