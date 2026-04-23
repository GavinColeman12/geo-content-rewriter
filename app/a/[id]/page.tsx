import { notFound } from "next/navigation";
import Link from "next/link";
import { getAuditById } from "@/lib/db";
import type { Metadata } from "next";
import { AuditView } from "@/components/AuditView";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!/^aud_[A-Za-z0-9_-]{8,}$/.test(params.id)) {
    return { title: "Audit not found" };
  }
  try {
    const a = await getAuditById(params.id);
    if (!a) return { title: "Audit not found" };
    const profile = a.profile as { name?: string } | null;
    const score = a.score as { overall?: number } | null;
    return {
      title: `GEO audit: ${profile?.name ?? a.url} — ${score?.overall ?? "?"}/100`,
      description: `AI-search visibility audit for ${profile?.name ?? a.url}. Score ${score?.overall ?? "?"}/100. See the exact queries that hit, the competitors that won, and the suggested fixes.`,
    };
  } catch {
    return { title: "GEO audit" };
  }
}

export default async function AuditSharePage({ params }: Props) {
  if (!/^aud_[A-Za-z0-9_-]{8,}$/.test(params.id)) {
    notFound();
  }
  let audit;
  try {
    audit = await getAuditById(params.id);
  } catch (err) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <div className="font-medium">Database error</div>
          <div className="mt-1 text-xs">
            {err instanceof Error ? err.message : String(err)}
          </div>
        </div>
      </main>
    );
  }
  if (!audit) notFound();

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
      <header className="mb-10">
        <div className="eyebrow mb-4 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-blue"></span>
          Crescendo Consulting · Shared GEO audit
        </div>
        <h1 className="text-balance font-display text-4xl text-ink sm:text-5xl">
          {(audit.profile as { name?: string })?.name || audit.url}
        </h1>
        <p className="mt-3 font-display text-[17px] leading-relaxed text-ink-muted">
          Audited{" "}
          {new Date(audit.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          {" · "}
          <a
            href={audit.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            {audit.url.replace(/^https?:\/\//i, "")}
          </a>
        </p>
      </header>

      <AuditView audit={audit} />

      <section className="mt-12 rounded-2xl bg-gradient-hero p-8 text-white sm:p-12">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-white/60">
          Want one for your site?
        </div>
        <h2 className="mb-4 font-display text-3xl text-white sm:text-4xl">
          Audit your own URL →
        </h2>
        <p className="mb-6 max-w-xl font-display text-[17px] leading-relaxed text-white/80">
          Drop your URL, get the exact queries AI search answers for your
          business — and the rewrite that closes the gaps.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:bg-paper-warm"
        >
          Run a free audit
        </Link>
      </section>

      <footer className="mt-16 border-t border-hairline pt-6 text-xs text-ink-light">
        <p>
          Audit ID:{" "}
          <code className="rounded bg-paper-soft px-1.5 py-0.5 text-ink-muted">
            {audit.id}
          </code>
          {" · "}
          Generated in {(audit.durationMs / 1000).toFixed(1)}s.
        </p>
      </footer>
    </main>
  );
}
