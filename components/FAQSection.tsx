import { Faq } from "@/lib/parseRewrite";

export function FAQSection({ faqs }: { faqs: Faq[] }) {
  if (faqs.length === 0) return null;
  return (
    <div className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
      {faqs.map((faq, idx) => (
        <details key={idx} className="group px-5 py-4" open={idx < 2}>
          <summary className="flex cursor-pointer items-start justify-between gap-4 list-none">
            <span className="text-sm font-medium text-stone-900">
              {faq.question}
            </span>
            <span className="shrink-0 text-stone-400 transition group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-600">
            {faq.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
