import { NextResponse } from "next/server";

function backendBaseUrl() {
  return process.env.CIE_BACKEND_URL ?? "http://localhost:3000";
}

export async function POST() {
  const backendRoot = backendBaseUrl().replace(/\/$/, "");

  try {
    const response = await fetch(`${backendRoot}/diagnose/queue/sweep-start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json(
        { message: payload?.message ?? payload?.error?.message ?? "Diagnosis queue scan failed" },
        { status: response.status },
      );
    }
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { message: `Diagnosis queue scan unavailable: ${error instanceof Error ? error.message : String(error)}` },
      { status: 502 },
    );
  }
}
