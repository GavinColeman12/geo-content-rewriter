import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "GEO Visibility Checker — embedded demo",
  description:
    "AI-search visibility checker. Drop a URL, see how often it appears in ChatGPT, Perplexity, and Claude answers.",
};

export default function EmbedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
