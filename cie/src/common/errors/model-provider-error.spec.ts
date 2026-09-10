import { redactModelProviderError, sanitizeModelProviderErrorForLog } from './model-provider-error';

describe('model provider error redaction', () => {
  it('summarizes provider errors without retaining request payloads', () => {
    const error = Object.assign(new Error('Cannot connect to API: headers timeout'), {
      isRetryable: true,
      url: 'https://api.openai.com/v1/responses',
      requestBodyValues: {
        input: [{ role: 'user', content: 'huge prompt' }],
        model: 'gpt-test',
      },
      cause: { code: 'UND_ERR_HEADERS_TIMEOUT' },
    });

    const redacted = redactModelProviderError(error);
    const sanitized = sanitizeModelProviderErrorForLog(error);

    expect(redacted).toMatchObject({
      code: 'MODEL_PROVIDER_ERROR',
      retryable: true,
      provider: 'openai',
      causeCode: 'UND_ERR_HEADERS_TIMEOUT',
    });
    expect(JSON.stringify(redacted)).not.toContain('huge prompt');
    expect(JSON.stringify(sanitized)).not.toContain('huge prompt');
    expect(JSON.stringify(sanitized)).toContain('[REDACTED]');
  });
});
