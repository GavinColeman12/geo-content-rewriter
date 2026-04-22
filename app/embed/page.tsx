import { VisibilityChecker } from "@/components/VisibilityChecker";
import { EmbedAutoResize } from "@/components/EmbedAutoResize";

export default function EmbedPage() {
  return (
    <>
      <EmbedAutoResize />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <div className="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-stone-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            GEO Visibility Checker
          </div>
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            Are you visible to AI search?
          </h1>
          <p className="mt-2 max-w-2xl text-balance text-sm leading-relaxed text-stone-600">
            Drop your URL. We run the queries your customers actually ask
            ChatGPT, Perplexity, and Claude — then score how often you show
            up.
          </p>
        </header>

        <VisibilityChecker />

        <footer className="mt-10 border-t border-stone-200 pt-4 text-center text-[11px] text-stone-500">
          Powered by{" "}
          <a
            href="https://crescendo-consulting.net"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-stone-800"
          >
            Crescendo Consulting
          </a>
          {" · "}
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-stone-800"
          >
            Open the full toolkit
          </a>
        </footer>
      </main>
    </>
  );
}
