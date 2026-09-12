import { NextRequest, NextResponse } from "next/server";

function backendBaseUrl() {
  return process.env.CIE_BACKEND_URL ?? "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  const backendRoot = backendBaseUrl().replace(/\/$/, "");
  const url = new URL(`${backendRoot}/diagnose/queue`);
  const status = request.nextUrl.searchParams.get("status");
  if (status && status !== "all") {
    url.searchParams.set("status", status);
  }

  try {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { message: payload?.message ?? payload?.error?.message ?? "Diagnosis queue API failed" },
        { status: response.status },
      );
    }
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: `Diagnosis queue API unavailable: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
