import type { ShiftBundle } from '../../copilot-simulation/copilot-simulation.types';
import { normalizeTrace, selectTraceWindow } from './trace-normalizer';

function bundle(overrides: Partial<ShiftBundle> = {}): ShiftBundle {
  return {
    shift: {
      id: '42',
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-01T08:00:00Z',
      timezone: 'UTC',
    },
    events: [],
    baseline: [],
    ...overrides,
  };
}

describe('Theo trace normalizer', () => {
  it('assigns stable source references before filtering and chronological sort', () => {
    const trace = normalizeTrace(
      bundle({
        events: [
          {
            ts: '2026-01-01T00:03:00Z',
            type: 'location',
            lat: 1,
            lng: 2,
          },
          {
            ts: '2026-01-01T00:02:00Z',
            type: 'guard_message',
            text: 'All clear',
          },
          {
            ts: '2026-01-01T00:01:00Z',
            type: 'job_log',
            category: 'checked in',
          },
        ],
        baseline: [
          {
            ts: '2026-01-01T00:02:05Z',
            type: 'turn_start',
            turn: 1,
            trigger: 'guard_message',
          },
        ],
      }),
    );

    expect(trace.map((entry) => entry.ref)).toEqual([
      'events:2',
      'events:1',
      'baseline:0',
    ]);
    expect(trace.some((entry) => entry.ref === 'events:0')).toBe(false);
    expect(trace.find((entry) => entry.ref === 'events:1')).toMatchObject({
      turnRef: 'baseline:0',
      trigger: 'guard_message',
      instructionFile: 'instructions/guard_response.md',
    });
  });

  it('associates messages to request bodies across inconsistent turn ordering', () => {
    const trace = normalizeTrace(
      bundle({
        baseline: [
          {
            ts: '2026-01-01T00:00:02Z',
            type: 'copilot_message',
            text: 'Do the loop.',
          },
          {
            ts: '2026-01-01T00:00:03Z',
            type: 'turn_start',
            turn: 1,
            trigger: 'guard_message',
          },
          {
            ts: '2026-01-01T00:00:04Z',
            type: 'tool_call',
            tool: 'mcp__calvis__request_copilot_dm',
            input: { body: 'Do the loop.' },
            output: { ok: true },
            trigger: 'guard_message',
          },
          {
            ts: '2026-01-01T00:00:05Z',
            type: 'turn_start',
            turn: 2,
            trigger: 'scheduled_check_in',
          },
          {
            ts: '2026-01-01T00:00:04.900Z',
            type: 'tool_call',
            tool: 'mcp__calvis__get_job_logs',
            input: {},
            output: { logs: [] },
            trigger: 'scheduled_check_in',
          },
        ],
      }),
    );

    expect(trace.find((entry) => entry.ref === 'baseline:0')).toMatchObject({
      turnRef: 'baseline:1',
      trigger: 'guard_message',
      instructionFile: 'instructions/guard_response.md',
    });
    expect(trace.find((entry) => entry.ref === 'baseline:2')).toMatchObject({
      turnRef: 'baseline:1',
    });
    expect(trace.find((entry) => entry.ref === 'baseline:1')?.silent).toBe(
      false,
    );
    expect(trace.find((entry) => entry.ref === 'baseline:3')?.silent).toBe(
      true,
    );
  });

  it('compacts location tool output but preserves summary facts', () => {
    const trace = normalizeTrace(
      bundle({
        baseline: [
          {
            ts: '2026-01-01T00:00:00Z',
            type: 'turn_start',
            turn: 1,
            trigger: 'scheduled_check_in',
          },
          {
            ts: '2026-01-01T00:00:01Z',
            type: 'tool_call',
            tool: 'mcp__calvis__get_guard_locations',
            input: { job_id: 42, include_pings: true },
            output: JSON.stringify({
              locations: [{ latitude: 10 }, { latitude: 11 }],
              guards: [
                {
                  guard_name: 'Hector',
                  is_stationary: true,
                  moved_distance_meters: 5,
                  heartbeat_trend: [{ status: 'online' }],
                },
              ],
            }),
            trigger: 'scheduled_check_in',
          },
        ],
      }),
    );
    const tool = trace.find((entry) => entry.ref === 'baseline:1');

    expect(tool?.content).toMatchObject({
      input: { job_id: 42, include_pings: true },
      output: {
        locations: { omitted: true, count: 2 },
        guards: [
          {
            guard_name: 'Hector',
            is_stationary: true,
            moved_distance_meters: 5,
            heartbeat_trend: { omitted: true, count: 1 },
          },
        ],
      },
    });
    expect(JSON.stringify(tool)).not.toContain('"latitude"');
  });

  it('can explicitly retain raw location and telemetry events', () => {
    const trace = normalizeTrace(
      bundle({
        events: [
          { ts: '2026-01-01T00:00:00Z', type: 'location', lat: 1, lng: 2 },
          {
            ts: '2026-01-01T00:00:01Z',
            type: 'telemetry',
            battery: 0.5,
          },
        ],
      }),
      { includeRawTelemetry: true },
    );

    expect(trace.map((entry) => entry.ref)).toEqual(['events:0', 'events:1']);
  });

  it('selects requested turns with linked guard and Copilot context', () => {
    const trace = normalizeTrace(
      bundle({
        events: [
          {
            ts: '2026-01-01T00:00:02Z',
            type: 'guard_message',
            text: 'Patrol complete.',
          },
        ],
        baseline: [
          {
            ts: '2026-01-01T00:00:00Z',
            type: 'turn_start',
            turn: 1,
            trigger: 'scheduled_check_in',
          },
          {
            ts: '2026-01-01T00:00:03Z',
            type: 'turn_start',
            turn: 2,
            trigger: 'guard_message',
          },
          {
            ts: '2026-01-01T00:00:04Z',
            type: 'copilot_message',
            text: 'Thanks for confirming.',
          },
        ],
      }),
    );

    const selected = selectTraceWindow(trace, {
      jobId: '42',
      startTurn: 2,
      endTurn: 2,
    });

    expect(selected.map((entry) => entry.ref)).toEqual([
      'job:42:events:0',
      'job:42:baseline:1',
      'job:42:baseline:2',
    ]);
    expect(selected[0].turnRef).toBe('job:42:baseline:1');
    expect(selected.some((entry) => entry.ref.includes('baseline:0'))).toBe(
      false,
    );
  });

  it('rejects invalid or missing turn bounds', () => {
    const trace = normalizeTrace(
      bundle({
        baseline: [
          {
            ts: '2026-01-01T00:00:00Z',
            type: 'turn_start',
            turn: 1,
            trigger: 'session_start',
          },
        ],
      }),
    );

    expect(() =>
      selectTraceWindow(trace, { jobId: '42', startTurn: 2, endTurn: 2 }),
    ).toThrow('does not contain startTurn 2');
    expect(() =>
      selectTraceWindow(trace, { jobId: '42', startTurn: 2, endTurn: 1 }),
    ).toThrow('startTurn cannot be greater');
  });
});
