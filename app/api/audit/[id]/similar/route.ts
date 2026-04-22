import { NextResponse } from "next/server";
import { getAuditById, getSimilarAudits, normalizeUrlKey } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!params.id || !/^aud_[A-Za-z0-9_-]{8,}$/.test(params.id)) {
    return NextResponse.json({ error: "Invalid audit ID." }, { status: 400 });
  }
  try {
    const anchor = await getAuditById(params.id);
    if (!anchor) {
      return NextResponse.json({ error: "Audit not found." }, { status: 404 });
    }
    const score = (anchor.score as { overall?: number })?.overall ?? 0;
    const similar = await getSimilarAudits(
      anchor.industry,
      score,
      normalizeUrlKey(anchor.url),
      5,
    );
    return NextResponse.json(
      { items: similar },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
