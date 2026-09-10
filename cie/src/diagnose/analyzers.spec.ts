import { analyzeDiagnoseWindow } from './analyzers';

const baseEntry = {
  source: 'baseline' as const,
  sourceIndex: 0,
  timestamp: '2026-01-01T00:00:00Z',
};

describe('diagnose analyzers', () => {
  it('detects repeated identical tool calls', () => {
    const patterns = analyzeDiagnoseWindow({
      intervalEvents: [],
      trace: [1, 2, 3].map((index) => ({
        ...baseEntry,
        ref: `baseline:${index}`,
        type: 'tool_call',
        content: {
          tool: 'get_job_logs',
          input: { job_id: '56370' },
        },
      })),
    });

    expect(patterns.some((pattern) => pattern.id === 'repeated-tool-calls')).toBe(
      true,
    );
  });

  it('detects guard input with no visible response', () => {
    const patterns = analyzeDiagnoseWindow({
      intervalEvents: [
        {
          ts: '2026-01-01T00:01:00Z',
          type: 'guard_message',
          text: 'I finished the patrol.',
        },
      ],
      trace: [
        {
          ...baseEntry,
          ref: 'baseline:1',
          type: 'turn_start',
          silent: true,
          content: { turn: 3, trigger: 'guard_message' },
        },
      ],
    });

    expect(
      patterns.some(
        (pattern) => pattern.id === 'guard-input-with-no-visible-response',
      ),
    ).toBe(true);
  });
});
