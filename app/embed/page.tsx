import { VisibilityChecker } from "@/components/VisibilityChecker";
import { EmbedAutoResize } from "@/components/EmbedAutoResize";

export default function EmbedPage() {
  return (
    <>
      <EmbedAutoResize />
      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-10">
        <header className="mb-8">
          <div className="eyebrow mb-3 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-blue"></span>
            GEO Visibility Checker
          </div>
          <h1 className="text-balance font-display text-3xl text-ink sm:text-4xl">
            Are you visible to <em>AI search?</em>
          </h1>
          <p className="mt-3 max-w-2xl font-display text-[16px] leading-relaxed text-ink-muted">
            Drop your URL. We run the queries your customers actually ask
            ChatGPT, Perplexity, and Claude — then score how often you show
            up.
          </p>
        </header>

        <VisibilityChecker />

        <footer className="mt-10 border-t border-hairline pt-4 text-center text-[11px] text-ink-light">
          Powered by{" "}
          <a
            href="https://crescendo-consulting.net"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            Crescendo Consulting
          </a>
          {" · "}
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            Open the full toolkit
          </a>
        </footer>
      </main>
    </>
  );
}
