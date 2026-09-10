import { compileTraceContext } from './trace-context.compiler';
import type { NormalizedTraceEntry } from '../mastra/theo/trace-normalizer';

const trace: NormalizedTraceEntry[] = [
  {
    ref: 'job:1:baseline:1',
    source: 'baseline',
    sourceIndex: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    type: 'turn_start',
    content: { turn: 1 },
  },
  {
    ref: 'job:1:events:1',
    source: 'events',
    sourceIndex: 1,
    timestamp: '2026-01-01T00:01:00.000Z',
    type: 'guard_message',
    content: 'All clear.',
  },
  {
    ref: 'job:1:baseline:2',
    source: 'baseline',
    sourceIndex: 2,
    timestamp: '2026-01-01T00:02:00.000Z',
    type: 'copilot_message',
    content: 'Thanks.',
  },
  ...Array.from({ length: 8 }, (_, index): NormalizedTraceEntry => ({
    ref: `job:1:baseline:${index + 3}`,
    source: 'baseline',
    sourceIndex: index + 3,
    timestamp: '2026-01-01T00:03:00.000Z',
    type: 'tool_call',
    content: {
      tool: 'mcp__calvis__get_job_logs',
      input: { job_id: 1 },
      output: { logs: [] },
      ok: true,
    },
  })),
];

describe('trace context compiler', () => {
  it('summarizes repeated tool calls and preserves evidence refs', () => {
    const context = compileTraceContext({ trace, purpose: 'theo' });

    expect(context.toolCounts).toEqual([
      { tool: 'get_job_logs', count: 8, failures: 0 },
    ]);
    expect(context.messages.map((message) => message.ref)).toEqual([
      'job:1:events:1',
      'job:1:baseline:2',
    ]);
    expect(context.omissions.join(' ')).toContain('tool calls summarized');
  });
});
