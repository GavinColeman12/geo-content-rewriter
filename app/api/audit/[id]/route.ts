import { NextResponse } from "next/server";
import { getAuditById } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!params.id || !/^aud_[A-Za-z0-9_-]{8,}$/.test(params.id)) {
    return NextResponse.json({ error: "Invalid audit ID." }, { status: 400 });
  }
  try {
    const audit = await getAuditById(params.id);
    if (!audit) {
      return NextResponse.json({ error: "Audit not found." }, { status: 404 });
    }
    return NextResponse.json(
      {
        id: audit.id,
        url: audit.url,
        industry: audit.industry,
        city: audit.city,
        autoIndustry: audit.autoIndustry,
        detection: audit.detection,
        scrapeMeta: audit.scrapeMeta,
        profile: audit.profile,
        queries: audit.queries,
        results: audit.results,
        score: audit.score,
        competitors: audit.competitors,
        analysis: audit.analysis,
        createdAt: audit.createdAt.toISOString(),
        durationMs: audit.durationMs,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
