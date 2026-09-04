const DEFAULT_BACKEND_ROOT = 'http://localhost:3000';

export async function GET(request: Request): Promise<Response> {
  const configuredRoot = process.env.COPILOT_API_BASE_URL?.trim();
  const backendRoot = (configuredRoot || DEFAULT_BACKEND_ROOT).replace(/\/$/, '');
  const incomingUrl = new URL(request.url);
  const backendUrl = new URL(`${backendRoot}/copilot/original`);

  for (const field of [
    'jobId',
    'startTurn',
    'endTurn',
    'source',
    'simulationNumber',
  ]) {
    const value = incomingUrl.searchParams.get(field);
    if (value !== null) {
      backendUrl.searchParams.set(field, value);
    }
  }

  try {
    const response = await fetch(backendUrl, { cache: 'no-store' });
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
      { message: `Original Copilot API unavailable: ${detail}` },
      { status: 502 },
    );
  }
}
