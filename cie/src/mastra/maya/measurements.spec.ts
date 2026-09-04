import type {
  CopilotSimulationResponse,
  CopilotSimulationTurn,
} from '../../copilot-simulation/copilot-simulation.types';
import { buildMayaEvidencePacket } from './evidence-packet';
import {
  computeMayaMeasurements,
  selectMeasurementKinds,
} from './measurements';

function buildTurn(
  overrides: Partial<CopilotSimulationTurn> = {},
): CopilotSimulationTurn {
  return {
    turn: 3,
    trigger: 'scheduled_wake',
    timestamp: '2026-01-01T00:03:00Z',
    shiftEvents: [],
    guardMessages: [],
    guardReplies: [],
    copilotMessages: [],
    modelText: null,
    finishReason: 'stop',
    toolCalls: [],
    silent: true,
    skipped: false,
    candidateCopilotOutput: { messages: [], actions: [], silent: true },
    historicalCopilotOutput: { messages: [], actions: [], silent: true },
    diverged: false,
    divergedThisTurn: false,
    ...overrides,
  };
}

function replay(
  replayMode: 'original' | 'candidate',
  turns: CopilotSimulationTurn[],
): CopilotSimulationResponse {
  return {
    jobId: '42',
    status: 'completed',
    startTurn: 3,
    endTurn: 4,
    replayMode,
    callNiko: false,
    modelConfiguration: { model: 'test', maxRetries: 0, maxSteps: 5 },
    turns,
    simulationNumber: 1,
    logFile: 'database/simulate-1.json',
  };
}

describe('Maya measurements', () => {
  it('selects only callout-relevant measurement families plus simulation disclosure', () => {
    expect(
      selectMeasurementKinds(
        'Copilot pushed back three times in four minutes and flagged him.',
      ),
    ).toEqual([
      'message_count',
      'message_timing',
      'flags',
      'trigger_to_action_latency',
      'simulated_guard_replies',
    ]);
    expect(selectMeasurementKinds('Unclear behavior.')).toEqual([
      'message_count',
      'action_counts',
      'simulated_guard_replies',
    ]);
  });

  it('computes messages, scheduled silence, normalized actions, flags, escalations, and simulations', () => {
    const historicalTurns = [
      buildTurn({
        historicalCopilotOutput: {
          messages: ['Wake response'],
          actions: [
            { tool: 'mcp__calvis__flag_copilot_guard', input: {} },
            { tool: 'mcp__calvis__escalate_to_ops', input: {} },
          ],
          silent: false,
        },
      }),
      buildTurn({
        turn: 4,
        trigger: 'guard_message',
        timestamp: '2026-01-01T00:04:00Z',
      }),
    ];
    const candidateTurns = [
      buildTurn({
        candidateCopilotOutput: {
          messages: [],
          actions: [],
          silent: true,
        },
      }),
      buildTurn({
        turn: 4,
        trigger: 'guard_message',
        timestamp: '2026-01-01T00:04:00Z',
        guardReplies: [
          {
            reply: null,
            source: 'simulated',
            historicalReply: 'Historical guard reply',
          },
        ],
      }),
    ];
    const oldReplay = replay('original', historicalTurns);
    const candidateReplay = replay('candidate', candidateTurns);
    const evidence = buildMayaEvidencePacket({
      callout:
        'On a scheduled wake the Copilot sent a message, flagged and escalated within minutes instead of silence.',
      oldReplay,
      candidateReplay,
    });
    const measured = computeMayaMeasurements(evidence);
    const historical = Object.fromEntries(
      measured.trajectories.historical.map(({ key, value }) => [key, value]),
    );
    const candidate = Object.fromEntries(
      measured.trajectories.candidate.map(({ key, value }) => [key, value]),
    );

    expect(historical).toMatchObject({
      copilot_message_count: 1,
      scheduled_wake_count: 1,
      scheduled_wake_silent_count: 0,
      'scheduled_wake_silent.turn.3': false,
      flag_count: 1,
      escalation_count: 1,
      'trigger_to_first_action_latency_ms.turn.3': null,
      simulated_guard_reply_count: 0,
    });
    expect(candidate).toMatchObject({
      copilot_message_count: 0,
      scheduled_wake_count: 1,
      scheduled_wake_silent_count: 1,
      'scheduled_wake_silent.turn.3': true,
      flag_count: 0,
      escalation_count: 0,
      simulated_guard_reply_count: 1,
      null_simulated_guard_reply_count: 1,
    });
  });

  it('uses inspectable evidence references for every nonempty observation', () => {
    const turns = [
      buildTurn(),
      buildTurn({
        turn: 4,
        trigger: 'guard_message',
        timestamp: '2026-01-01T00:04:00Z',
        candidateCopilotOutput: {
          messages: ['Hello'],
          actions: [
            { tool: 'vendor__create_copilot_task', input: { title: 'Check' } },
          ],
          silent: false,
        },
      }),
    ];
    const evidence = buildMayaEvidencePacket({
      callout: 'Copilot sent a message and created a task.',
      oldReplay: replay('original', turns),
      candidateReplay: replay('candidate', turns),
    });
    const measured = computeMayaMeasurements(evidence);
    const candidate = measured.trajectories.candidate;

    expect(
      candidate.find((item) => item.key === 'copilot_message_count'),
    ).toEqual(
      expect.objectContaining({
        value: 1,
        evidenceRefs: ['candidate:turn:4:message:0'],
      }),
    );
    expect(
      candidate.find((item) => item.key === 'action_count.create_copilot_task'),
    ).toEqual(
      expect.objectContaining({
        value: 1,
        evidenceRefs: ['candidate:turn:4:action:0'],
      }),
    );
  });
});
