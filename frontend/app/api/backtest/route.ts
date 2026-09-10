const DEFAULT_BACKEND_ROOT = 'http://localhost:3000';

export async function POST(request: Request): Promise<Response> {
  const configuredRoot = process.env.COPILOT_API_BASE_URL?.trim();
  const backendRoot = (configuredRoot || DEFAULT_BACKEND_ROOT).replace(/\/$/, '');
  const backendUrl = `${backendRoot}/copilot/backtest`;

  try {
    const response = await fetch(backendUrl, {
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
    return Response.json(
      unavailableBackendError({ backendUrl, error }),
      { status: 502 },
    );
  }
}

function unavailableBackendError({
  backendUrl,
  error,
}: {
  backendUrl: string;
  error: unknown;
}) {
  const cause = errorCause(error);
  return {
    message: `Could not reach CIE backend at ${backendUrl}.`,
    code: 'BACKEND_UNAVAILABLE',
    phase: 'frontend_proxy',
    backendUrl: redact(backendUrl),
    detail: redact(cause.detail),
    retryable: true,
    hint: 'Start the backend with: cd calvis-backtesting-project/cie && npm run start:dev',
    cause: {
      name: cause.name,
      code: cause.code,
    },
  };
}

function errorCause(error: unknown): { name: string; detail: string; code?: string } {
  if (!(error instanceof Error)) {
    return { name: 'UnknownError', detail: String(error) };
  }
  const nested = (error as Error & { cause?: unknown }).cause;
  const code = isRecord(nested) && typeof nested.code === 'string'
    ? nested.code
    : undefined;
  const nestedMessage = nested instanceof Error ? nested.message : undefined;
  return {
    name: error.name,
    detail: nestedMessage ? `${error.message}: ${nestedMessage}` : error.message,
    code,
  };
}

function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|key|api_key|auth)=)[^&]+/gi, '$1[REDACTED]');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
