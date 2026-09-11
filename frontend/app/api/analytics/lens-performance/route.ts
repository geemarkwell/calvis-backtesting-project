import { NextRequest, NextResponse } from "next/server";

function backendBaseUrl() {
  return process.env.CIE_BACKEND_URL ?? "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  const backendRoot = backendBaseUrl().replace(/\/$/, "");
  const url = new URL(`${backendRoot}/analytics/lens-performance`);
  const range = request.nextUrl.searchParams.get("range");
  if (range) url.searchParams.set("range", range);

  try {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { message: payload?.message ?? payload?.error?.message ?? "Analytics API failed" },
        { status: response.status },
      );
    }
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: `Analytics API unavailable: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
