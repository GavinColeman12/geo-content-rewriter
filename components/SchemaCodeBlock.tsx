"use client";

import { useState } from "react";

export function SchemaCodeBlock({ schemaJson, raw }: { schemaJson: string; raw: string }) {
  const [copied, setCopied] = useState(false);
  const [validated, setValidated] = useState<null | "valid" | "invalid">(null);

  if (!schemaJson && !raw) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(schemaJson || raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleValidate = () => {
    try {
      JSON.parse(schemaJson);
      setValidated("valid");
    } catch {
      setValidated("invalid");
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-stone-900">
      <div className="flex items-center justify-between border-b border-stone-700 bg-stone-800 px-4 py-2.5">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-light/60">
          JSON-LD schema — paste into your site&apos;s &lt;head&gt;
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleValidate}
            className="rounded-md bg-ink px-3 py-1 text-xs text-stone-100 hover:bg-ink-muted"
          >
            {validated === "valid"
              ? "✓ valid JSON"
              : validated === "invalid"
                ? "✗ invalid JSON"
                : "Validate"}
          </button>
          <button
            onClick={handleCopy}
            className="rounded-md bg-paper-soft px-3 py-1 text-xs font-medium text-ink hover:bg-white"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="max-h-[500px] overflow-auto px-4 py-3 text-xs leading-relaxed text-stone-100">
        <code>{raw || schemaJson}</code>
      </pre>
    </div>
  );
}
