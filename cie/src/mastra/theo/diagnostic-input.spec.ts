import { resolve } from 'node:path';
import {
  calloutConcernsRawTelemetry,
  extractShiftId,
  loadDiagnosticInput,
  theoRequestSchema,
} from './diagnostic-input';

const bundleRoot = resolve(process.cwd(), '..');

describe('Theo diagnostic input', () => {
  it.each([
    ['On job 56370 the copilot pushed back.', '56370'],
    ['Shift ID: #50837 went quiet.', '50837'],
    ['Review shift-46116.', '46116'],
  ])(
    'retains legacy shift-ID extraction for existing callers',
    (callout, expected) => {
      expect(extractShiftId(callout)).toBe(expected);
    },
  );

  it('validates structured prompt-debugging requests', () => {
    const request = {
      whatWentWrong: 'Copilot repeatedly challenged completed patrols.',
      badResponses: [
        { jobId: 56370, startTurn: 9, endTurn: 16 },
        { jobId: '50837', startTurn: 7, endTurn: 9 },
      ],
      expectedBehavior: 'Acknowledge credible completion reports.',
    };

    expect(theoRequestSchema.parse(request).badResponses[0].jobId).toBe(
      '56370',
    );
    expect(
      theoRequestSchema.safeParse({ ...request, badResponses: [] }).success,
    ).toBe(false);
    expect(
      theoRequestSchema.safeParse({
        ...request,
        badResponses: [{ jobId: '56370', startTurn: 10, endTurn: 9 }],
      }).success,
    ).toBe(false);
    expect(
      theoRequestSchema.safeParse({
        ...request,
        badResponses: [request.badResponses[0], request.badResponses[0]],
      }).success,
    ).toBe(false);
  });

  it('accepts a simulation target instead of a job and turn window', () => {
    const base = {
      whatWentWrong: 'The simulated response repeated an unnecessary ask.',
      expectedBehavior: 'Acknowledge the completed patrol.',
    };

    expect(
      theoRequestSchema.parse({
        ...base,
        badResponses: [{ simTarget: '3' }],
      }).badResponses,
    ).toEqual([{ simTarget: 3 }]);
    expect(
      theoRequestSchema.safeParse({
        ...base,
        badResponses: [
          {
            jobId: '56370',
            simTarget: 3,
            startTurn: 9,
            endTurn: 10,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      theoRequestSchema.safeParse({
        ...base,
        badResponses: [{ startTurn: 9, endTurn: 10 }],
      }).success,
    ).toBe(false);
  });

  it('only opts into raw telemetry for an explicit telemetry concern', () => {
    expect(calloutConcernsRawTelemetry('Shift lost GPS location pings.')).toBe(
      true,
    );
    expect(calloutConcernsRawTelemetry('Copilot sent too many messages.')).toBe(
      false,
    );
  });

  it('loads only requested turns and complete stable prompt surface', async () => {
    const input = await loadDiagnosticInput({
      request: {
        whatWentWrong: 'Copilot pushed back repeatedly.',
        badResponses: [{ jobId: '56370', startTurn: 9, endTurn: 16 }],
        expectedBehavior: 'Acknowledge credible completion reports.',
      },
      bundleRoot,
    });

    expect(input.shifts.map(({ jobId }) => jobId)).toEqual(['56370']);
    expect(input.badResponses[0]).toMatchObject({
      jobId: '56370',
      startTurn: 9,
      endTurn: 16,
    });
    expect(Object.keys(input.promptFiles)).toEqual([
      'PROMPTS.md',
      'core/comms_policy.md',
      'core/context.md',
      'core/holding_the_post.md',
      'core/identity.md',
      'core/obligations.md',
      'core/tools.md',
      'instructions/approval_decision.md',
      'instructions/default.md',
      'instructions/guard_response.md',
      'instructions/job_event.md',
      'instructions/obligation_due.md',
      'instructions/operator_message.md',
      'instructions/scheduled_check_in.md',
      'instructions/session_start.md',
    ]);
    expect(
      input.badResponses[0].trace.every((entry) =>
        entry.ref.startsWith('job:56370:'),
      ),
    ).toBe(true);
    expect(
      input.badResponses[0].trace.some(
        (entry) =>
          entry.type === 'turn_start' &&
          typeof entry.content === 'object' &&
          entry.content !== null &&
          'turn' in entry.content &&
          entry.content.turn === 9,
      ),
    ).toBe(true);
    expect(JSON.stringify(input).length).toBeLessThan(175_000);
  });

  it('loads multiple windows across jobs without reference collisions', async () => {
    const input = await loadDiagnosticInput({
      request: {
        whatWentWrong: 'Copilot mishandled two responses.',
        badResponses: [
          { jobId: '56370', startTurn: 9, endTurn: 10 },
          { jobId: '50837', startTurn: 7, endTurn: 8 },
        ],
        expectedBehavior: 'Handle both conversations consistently.',
      },
      bundleRoot,
    });

    expect(input.shifts.map(({ jobId }) => jobId)).toEqual(['56370', '50837']);
    const refs = input.badResponses.flatMap((window) =>
      window.trace.map((entry) => entry.ref),
    );
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('loads the selected simulation output and derives its job and bounds', async () => {
    const input = await loadDiagnosticInput({
      request: {
        whatWentWrong: 'The simulated Copilot sent an unnecessary response.',
        badResponses: [{ simTarget: 3 }],
        expectedBehavior: 'Remain silent when no action is needed.',
      },
      bundleRoot,
    });

    expect(input.badResponses[0]).toMatchObject({
      jobId: '56370',
      simTarget: 3,
      startTurn: 8,
      endTurn: 11,
    });
    expect(
      input.badResponses[0].trace.every((entry) =>
        entry.ref.startsWith('job:56370:simulation:3:'),
      ),
    ).toBe(true);
    expect(JSON.stringify(input.badResponses[0].trace)).toContain(
      'Scheduled sweep: quick update from me.',
    );
    expect(JSON.stringify(input.badResponses[0].trace)).not.toContain(
      'Post your first patrol report',
    );
  });

  it('allows a simulation target to select a narrower turn window', async () => {
    const input = await loadDiagnosticInput({
      request: {
        whatWentWrong: 'The turn 10 simulation response was wrong.',
        badResponses: [{ simTarget: 3, startTurn: 10, endTurn: 10 }],
        expectedBehavior: 'Handle the report without another request.',
      },
      bundleRoot,
    });

    expect(input.badResponses[0]).toMatchObject({
      jobId: '56370',
      simTarget: 3,
      startTurn: 10,
      endTurn: 10,
    });
    expect(
      input.badResponses[0].trace.some(
        (entry) =>
          entry.type === 'turn_start' &&
          typeof entry.content === 'object' &&
          entry.content !== null &&
          'turn' in entry.content &&
          entry.content.turn === 10,
      ),
    ).toBe(true);
    expect(JSON.stringify(input.badResponses[0].trace)).not.toContain(
      'Scheduled sweep: quick update from me.',
    );
  });

  it('rejects requested turns absent from a fixture', async () => {
    await expect(
      loadDiagnosticInput({
        request: {
          whatWentWrong: 'Bad response.',
          badResponses: [{ jobId: '56370', startTurn: 999, endTurn: 999 }],
          expectedBehavior: 'Better response.',
        },
        bundleRoot,
      }),
    ).rejects.toThrow('does not contain startTurn 999');
  });
});
