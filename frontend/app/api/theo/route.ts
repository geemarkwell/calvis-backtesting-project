const DEFAULT_BACKEND_ROOT = 'http://localhost:3000';

export async function POST(request: Request): Promise<Response> {
  const configuredRoot = process.env.COPILOT_API_BASE_URL?.trim();
  const backendRoot = (configuredRoot || DEFAULT_BACKEND_ROOT).replace(/\/$/, '');

  try {
    const response = await fetch(`${backendRoot}/theo/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await request.text(),
      cache: 'no-store',
    });

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
      { message: `Theo API unavailable: ${detail}` },
      { status: 502 },
    );
  }
}
