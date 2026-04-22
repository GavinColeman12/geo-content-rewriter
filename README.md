# GEO Content Rewriter

Public demo tool that rewrites business website copy for AI-search discoverability (ChatGPT, Perplexity, Claude, Google AI Overviews). Built for `demo-rewriter.crescendo-consulting.net`.

Takes pasted copy + industry + city. Streams two-step output:

1. **Research** (optional): what real customers ask AI, and where current copy falls short.
2. **Rewrite**: side-by-side before/after with diff highlights, 8–10 FAQs, valid JSON-LD schema, and a "what changed and why" explainer.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- `@anthropic-ai/sdk` v0.90 → `claude-sonnet-4-6` with streaming
- Optional rate limiting via Upstash Redis (5 rewrites / IP / day)

## Local dev

```bash
cp .env.example .env.local
# add your ANTHROPIC_API_KEY

npm install
npm run dev
# open http://localhost:3000
```

Rate limiting is **disabled** unless `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set — fine for local.

## Deploy to Vercel

One-time setup:

```bash
npm install -g vercel
vercel login
vercel link          # link this directory to a new Vercel project
```

Set env vars (copy your values from `.env.local`):

```bash
vercel env add ANTHROPIC_API_KEY production
# optional:
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
```

Deploy:

```bash
vercel --prod
```

## Custom domain

Point `demo-rewriter.crescendo-consulting.net` at the Vercel deployment:

1. In the Vercel project → **Settings → Domains** → add `demo-rewriter.crescendo-consulting.net`
2. Vercel shows a CNAME target (e.g. `cname.vercel-dns.com`)
3. At your DNS provider for `crescendo-consulting.net`, add:
   - Type: `CNAME`
   - Name: `demo-rewriter`
   - Value: (the CNAME target Vercel gave you)
4. Wait for propagation; Vercel issues the TLS cert automatically

## Rate limiting (optional)

To protect your Anthropic budget:

1. Sign up at https://console.upstash.com (free tier works)
2. Create a Redis database → copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN**
3. Add both to `.env.local` for dev and to Vercel env vars for prod
4. Default limit: 5 rewrites per IP per day (tune in `lib/rateLimit.ts`)

Without these env vars, rate limiting is a no-op.

## Architecture

```
app/
  page.tsx                  # single-page UI
  api/analyze/route.ts      # POST — streams research markdown
  api/rewrite/route.ts      # POST — streams 4 sections (REWRITE/FAQS/SCHEMA/EXPLANATION)
components/
  CopyInput.tsx             # textarea + industry/city + toggle + submit
  ResearchPanel.tsx         # streaming markdown
  BeforeAfterCompare.tsx    # side-by-side paragraphs, ==diff== → highlighted
  FAQSection.tsx            # collapsible FAQ list
  SchemaCodeBlock.tsx       # code block with copy + JSON validate
  ChangeExplanation.tsx     # amber callout
lib/
  anthropic.ts              # lazy Anthropic client + model constant
  systemPrompt.ts           # GEO + analyze system prompts
  industryPrompts.ts        # per-industry context (dental, medical, law, medspa, home, other)
  parseRewrite.ts           # splits streamed output into structured sections
  rateLimit.ts              # Upstash fixed-window (graceful fallback)
```

## Model

`claude-sonnet-4-6` — configured in `lib/anthropic.ts`. To swap: change `CLAUDE_MODEL`. Both routes use streaming; the rewrite route's output is section-delimited by headings (`### REWRITE`, `### FAQS`, `### SCHEMA`, `### EXPLANATION`) and parsed client-side as it streams.

## What this is and isn't

This is the **demo** — single page, public, rate-limited. It shows prospects what GEO-optimized copy looks like. The sales pitch (implementation, schema deployment, ongoing monitoring) is Crescendo's real service, linked in the footer.
