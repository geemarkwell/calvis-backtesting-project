import { NextRequest, NextResponse } from "next/server";

function backendBaseUrl() {
  return process.env.CIE_BACKEND_URL ?? "http://localhost:3000";
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const backendRoot = backendBaseUrl().replace(/\/$/, "");

  try {
    const response = await fetch(
      `${backendRoot}/diagnose/queue/${encodeURIComponent(id)}/cancel`,
      { method: "POST", cache: "no-store" },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { message: payload?.message ?? payload?.error?.message ?? "Diagnosis queue item cancel failed" },
        { status: response.status },
      );
    }
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: `Diagnosis queue item cancel unavailable: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
