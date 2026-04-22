import { NextResponse } from "next/server";
import { INDUSTRIES } from "@/lib/industryPrompts";
import { getBenchmarkForIndustry } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { industry: string } },
) {
  if (!INDUSTRIES.find((i) => i.value === params.industry)) {
    return NextResponse.json({ error: "Invalid industry." }, { status: 400 });
  }
  try {
    const b = await getBenchmarkForIndustry(params.industry);
    return NextResponse.json(b ?? { count: 0 }, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
