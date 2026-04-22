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
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
          Crescendo Consulting · Shared GEO audit
        </div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          {(audit.profile as { name?: string })?.name || audit.url}
        </h1>
        <p className="mt-2 text-sm text-stone-600">
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
            className="underline underline-offset-2 hover:text-stone-900"
          >
            {audit.url.replace(/^https?:\/\//i, "")}
          </a>
        </p>
      </header>

      <AuditView audit={audit} />

      <section className="mt-12 rounded-2xl border border-stone-200 bg-stone-900 p-6 text-white sm:p-8">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-400">
          Want one for your site?
        </div>
        <h2 className="mb-3 text-xl font-semibold tracking-tight">
          Audit your own URL →
        </h2>
        <p className="mb-4 max-w-xl text-sm text-stone-300">
          Drop your URL, get the exact queries AI search answers for your
          business — and the rewrite that closes the gaps.
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-stone-900 transition hover:bg-stone-100"
        >
          Run a free audit
        </Link>
      </section>

      <footer className="mt-16 border-t border-stone-200 pt-6 text-xs text-stone-500">
        <p>
          Audit ID:{" "}
          <code className="rounded bg-stone-100 px-1.5 py-0.5 text-stone-700">
            {audit.id}
          </code>
          {" · "}
          Generated in {(audit.durationMs / 1000).toFixed(1)}s.
        </p>
      </footer>
    </main>
  );
}
