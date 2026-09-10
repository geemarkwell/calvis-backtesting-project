const REDACTED_ERROR_FIELDS = new Set([
  'requestBodyValues',
  'input',
  'messages',
  'promptFiles',
  'structuredOutputSchema',
  'schema',
  'tools',
  'headers',
  'authorization',
  'apiKey',
  'token',
  'password',
  'secret',
]);

export interface RedactedModelProviderError {
  message: string;
  code: string;
  retryable: boolean;
  provider?: string;
  url?: string;
  statusCode?: number;
  requestId?: string;
  detail?: string;
  causeCode?: string;
}

export function isRetryableModelProviderError(error: unknown): boolean {
  return Boolean(
    isRecord(error) && error.isRetryable === true,
  );
}

export function redactModelProviderError(error: unknown): RedactedModelProviderError {
  if (!isRecord(error)) {
    return {
      message: String(error),
      code: 'MODEL_PROVIDER_ERROR',
      retryable: false,
    };
  }

  const responseBody = parseResponseBody(error.responseBody);
  const dataError = isRecord(error.data) && isRecord(error.data.error)
    ? error.data.error
    : undefined;
  const bodyError = isRecord(responseBody) && isRecord(responseBody.error)
    ? responseBody.error
    : undefined;
  const providerError = dataError ?? bodyError;
  const cause = isRecord(error.cause) ? error.cause : undefined;
  const message = stringFrom(providerError?.message)
    ?? (error instanceof Error ? error.message : undefined)
    ?? stringFrom(error.message)
    ?? 'Model provider call failed.';
  const url = stringFrom(error.url);

  return removeUndefined({
    message,
    code: 'MODEL_PROVIDER_ERROR',
    retryable: error.isRetryable === true,
    provider: providerFromUrl(url),
    url,
    statusCode: numberFrom(error.statusCode),
    requestId: requestIdFromHeaders(error.responseHeaders),
    detail: detailFromError(message),
    causeCode: stringFrom(cause?.code),
  });
}

export function sanitizeModelProviderErrorForLog(error: unknown): unknown {
  if (!isRecord(error)) {
    return String(error);
  }
  return sanitizeValue(error, 0);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 4) return '[MAX_DEPTH]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  if (!isRecord(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (REDACTED_ERROR_FIELDS.has(key) || /api[_-]?key|token|secret|password|authorization|cookie/i.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    output[key] = sanitizeValue(item, depth + 1);
  }
  return output;
}

function parseResponseBody(value: unknown): unknown {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function requestIdFromHeaders(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const requestId = value['x-request-id'] ?? value['X-Request-ID'] ?? value['openai-request-id'];
  return typeof requestId === 'string' ? requestId : undefined;
}

function providerFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.includes('api.openai.com')) return 'openai';
  if (url.includes('anthropic.com')) return 'anthropic';
  return undefined;
}

function detailFromError(message: string): string {
  return message.replace(/\s+/g, ' ').slice(0, 500);
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined) {
      delete value[key];
    }
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
