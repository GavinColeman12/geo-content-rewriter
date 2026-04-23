import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GEO Toolkit — visibility audit + AI-search rewriter",
  description:
    "Drop your URL. Get a visibility score showing how often you surface in ChatGPT, Perplexity, and Claude for the queries your customers actually ask — plus a side-by-side rewrite with FAQs and JSON-LD schema to close the gaps.",
  openGraph: {
    title: "GEO Toolkit — visibility audit + AI-search rewriter",
    description:
      "How often does your business appear in AI search? Get a score, the queries you're missing, and the rewrite that fixes it.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
