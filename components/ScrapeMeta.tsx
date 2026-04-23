export type ScrapeMeta = {
  url: string;
  title: string;
  wordCount: number;
  h1: string[];
};

export function ScrapeMetaCard({ meta }: { meta: ScrapeMeta | null }) {
  if (!meta) return null;
  return (
    <div className="rounded-xl border border-hairline bg-paper-warm p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-light">
        We read this page
      </div>
      <div className="space-y-1 text-sm">
        <div className="truncate text-ink">
          <span className="font-medium">{meta.title || "(no title tag)"}</span>
        </div>
        <div className="truncate text-xs text-ink-light">{meta.url}</div>
        <div className="text-xs text-ink-light">
          {meta.wordCount.toLocaleString()} words ·{" "}
          {meta.h1.length > 0 ? `H1: ${meta.h1[0]}` : "no H1 found"}
        </div>
      </div>
    </div>
  );
}
