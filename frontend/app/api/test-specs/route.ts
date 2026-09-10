const DEFAULT_BACKEND_ROOT = "http://localhost:3000";

function backendRoot(): string {
  const configuredRoot = process.env.COPILOT_API_BASE_URL?.trim();
  return (configuredRoot || DEFAULT_BACKEND_ROOT).replace(/\/$/, "");
}

export async function POST(request: Request): Promise<Response> {
  try {
    const response = await fetch(`${backendRoot()}/test-specs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json(
      { message: `Test specs API unavailable: ${detail}` },
      { status: 502 },
    );
  }
}
