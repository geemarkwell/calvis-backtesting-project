const DEFAULT_BACKEND_ROOT = 'http://localhost:3000';

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const configuredRoot = process.env.COPILOT_API_BASE_URL?.trim();
  const backendRoot = (configuredRoot || DEFAULT_BACKEND_ROOT).replace(/\/$/, '');
  const { runId } = await context.params;

  try {
    const response = await fetch(
      `${backendRoot}/diagnose/runs/${encodeURIComponent(runId)}`,
      { cache: 'no-store' },
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type':
          response.headers.get('Content-Type') ?? 'application/json',
      },
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json(
      { message: `Diagnosis run API unavailable: ${detail}` },
      { status: 502 },
    );
  }
}
