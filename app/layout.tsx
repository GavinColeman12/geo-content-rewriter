import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GEO Content Rewriter — make your site discoverable by AI search",
  description:
    "Rewrite your website copy for ChatGPT, Perplexity, Claude, and Google AI Overviews. Get a side-by-side rewrite, suggested FAQs, and JSON-LD schema in under a minute.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
