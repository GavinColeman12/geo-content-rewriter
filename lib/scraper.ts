import * as cheerio from "cheerio";
import { promises as dns } from "dns";
import { isIP } from "net";

export type ScrapeResult = {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  h1: string[];
  headings: string[];
  bodyText: string;
  wordCount: number;
};

const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; CrescendoGEOBot/1.0; +https://crescendo-consulting.net/bot)";

function isPrivateIp(ip: string): boolean {
  if (!isIP(ip)) return false;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("fe80:")) return true;
  return false;
}

function normalizeUrl(input: string): URL {
  let raw = input.trim();
  if (!raw) throw new Error("URL is empty.");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  if (!url.hostname || url.hostname === "localhost") {
    throw new Error("Localhost URLs aren't allowed.");
  }
  return url;
}

async function assertHostIsPublic(hostname: string): Promise<void> {
  if (isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error("Private or loopback IPs aren't allowed.");
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error("This hostname resolves to a private IP.");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("private")) throw err;
    throw new Error(`Could not resolve ${hostname}.`);
  }
}

export async function scrapeUrl(input: string): Promise<ScrapeResult> {
  const url = normalizeUrl(input);
  await assertHostIsPublic(url.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("The site took too long to respond (>12s).");
    }
    throw new Error(
      `Couldn't fetch that URL: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new Error(`The site returned HTTP ${res.status}.`);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("html") && !ct.includes("xml") && ct !== "") {
    throw new Error(
      `Expected an HTML page — got ${ct.split(";")[0]} instead.`,
    );
  }

  const finalUrl = res.url || url.toString();
  const finalHost = new URL(finalUrl).hostname;
  if (finalHost !== url.hostname) {
    await assertHostIsPublic(finalHost);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Empty response body.");

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      try { await reader.cancel(); } catch {}
      throw new Error("Page is too large (>2MB).");
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg").remove();

  const title = ($("title").first().text() || "").trim();
  const description =
    ($('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "").trim();
  const h1 = $("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const headings = $("h2, h3")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const root =
    $("main").first().length > 0
      ? $("main").first()
      : $("article").first().length > 0
        ? $("article").first()
        : $("body").first();

  const textBlocks: string[] = [];
  root.find("h1, h2, h3, h4, p, li, blockquote").each((_, el) => {
    const tag = (el as any).tagName?.toLowerCase?.() ?? "p";
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    if (!txt) return;
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      textBlocks.push("\n## " + txt);
    } else {
      textBlocks.push(txt);
    }
  });

  const bodyText = textBlocks.join("\n").trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;

  if (wordCount < 30) {
    throw new Error(
      "Couldn't extract enough text from that page. Try a different URL (About or Services page works best) — or the site may render content via JavaScript.",
    );
  }

  const truncated =
    bodyText.length > 15_000 ? bodyText.slice(0, 15_000) + "\n\n[...truncated]" : bodyText;

  return {
    url: url.toString(),
    finalUrl,
    title,
    description,
    h1: h1.slice(0, 5),
    headings: headings.slice(0, 30),
    bodyText: truncated,
    wordCount,
  };
}

export function formatScrapedForPrompt(s: ScrapeResult): string {
  return [
    `URL: ${s.finalUrl}`,
    s.title ? `<title>: ${s.title}` : "",
    s.description ? `<meta description>: ${s.description}` : "",
    s.h1.length ? `<h1>: ${s.h1.join(" | ")}` : "",
    "",
    "Body content:",
    s.bodyText,
  ]
    .filter(Boolean)
    .join("\n");
}
