import type {
  CopilotSimulationResponse,
  CopilotSimulationTurn,
} from '../../copilot-simulation/copilot-simulation.types';
import {
  buildMayaEvidencePacket,
  buildMayaJudgeInput,
} from './evidence-packet';
import { mayaJudgeInputSchema } from './schemas';

function turn(
  overrides: Partial<CopilotSimulationTurn> = {},
): CopilotSimulationTurn {
  return {
    turn: 18,
    trigger: 'scheduled_check_in',
    timestamp: '2026-01-01T03:12:00Z',
    shiftEvents: [
      {
        ts: '2026-01-01T03:11:30Z',
        type: 'job_log',
        text: 'Patrol complete',
      },
    ],
    guardMessages: ['I checked both buildings.'],
    guardReplies: [
      {
        reply: 'I checked both buildings.',
        source: 'historical',
        historicalReply: 'I checked both buildings.',
      },
    ],
    copilotMessages: ['Please confirm again.'],
    modelText: null,
    finishReason: 'tool-calls',
    toolCalls: [],
    silent: false,
    skipped: false,
    candidateCopilotOutput: {
      messages: ['Please confirm again.'],
      actions: [
        {
          tool: 'mcp__calvis__flag_copilot_guard',
          input: { reason: 'Patrol not verified' },
        },
      ],
      silent: false,
    },
    historicalCopilotOutput: {
      messages: ['Historical challenge.'],
      actions: [
        {
          tool: 'mcp__calvis__escalate_to_ops',
          input: { reason: 'Historical escalation' },
        },
      ],
      silent: false,
    },
    diverged: true,
    divergedThisTurn: true,
    ...overrides,
  };
}

function replay(
  replayMode: 'original' | 'candidate',
  overrides: Partial<CopilotSimulationResponse> = {},
): CopilotSimulationResponse {
  return {
    jobId: '56370',
    status: 'completed',
    startTurn: 18,
    endTurn: 18,
    replayMode,
    callNiko: false,
    modelConfiguration: {
      model: 'openai/gpt-5-mini',
      maxRetries: 1,
      maxSteps: 8,
    },
    turns: [turn()],
    simulationNumber: 1,
    logFile: 'database/simulate-1.json',
    ...overrides,
  };
}

describe('Maya evidence packet', () => {
  it('builds equal-format bounded trajectories with stable references', () => {
    const packet = buildMayaEvidencePacket({
      callout: ' Copilot challenged and flagged the guard. ',
      oldReplay: replay('original'),
      candidateReplay: replay('candidate', {
        turns: [
          turn({
            guardReplies: [
              {
                reply: 'That is what happened.',
                source: 'simulated',
                historicalReply: 'I checked both buildings.',
              },
            ],
            candidateCopilotOutput: {
              messages: [],
              actions: [],
              silent: true,
            },
          }),
        ],
      }),
    });

    expect(packet.callout).toBe('Copilot challenged and flagged the guard.');
    expect(Object.keys(packet.trajectories)).toEqual([
      'historical',
      'old',
      'candidate',
    ]);
    expect(packet.trajectories.historical.turns[0]).toMatchObject({
      ref: 'historical:turn:18',
      guardReplies: [
        {
          ref: 'historical:turn:18:guard-reply:0',
          source: 'historical',
          message: 'I checked both buildings.',
        },
      ],
      copilotMessages: [
        {
          ref: 'historical:turn:18:message:0',
          text: 'Historical challenge.',
        },
      ],
      actions: [
        {
          ref: 'historical:turn:18:action:0',
          tool: 'escalate_to_ops',
        },
      ],
    });
    expect(packet.trajectories.old.turns[0].guardReplies[0].source).toBe(
      'historical',
    );
    expect(
      packet.trajectories.candidate.turns[0].guardReplies[0],
    ).toMatchObject({
      source: 'simulated',
      historicalMessage: 'I checked both buildings.',
    });
    expect(packet.warnings).toContain(
      'candidate turn 18 uses a simulated guard reply; real guard behavior may differ.',
    );
  });

  it('allow-lists evidence and omits replay debug and prompt-edit data', () => {
    const oldReplay = replay('original', {
      turns: [
        turn({
          debug: {
            systemPrompt: 'DO_NOT_LEAK_SYSTEM_PROMPT',
            turnMessage: 'DO_NOT_LEAK_TURN_CONTEXT',
            conversationHistory: [],
            eventsSupplied: [],
            toolTrace: [],
            modelConfiguration: {
              model: 'openai/gpt-5-mini',
              maxRetries: 1,
              maxSteps: 8,
            },
            copilotOutput: {
              text: null,
              messages: [],
              finishReason: 'stop',
            },
          },
        }),
      ],
    });
    const packet = buildMayaEvidencePacket({
      callout: 'Do not expose Theo.',
      oldReplay,
      candidateReplay: replay('candidate'),
    });
    const serialized = JSON.stringify(packet);

    expect(serialized).not.toContain('DO_NOT_LEAK_SYSTEM_PROMPT');
    expect(serialized).not.toContain('DO_NOT_LEAK_TURN_CONTEXT');
    expect(serialized).not.toContain('"debug":');
    expect(serialized).not.toContain('promptDiff');
  });

  it('rejects replay mode, job, bound, turn, and trigger mismatches', () => {
    const validOld = replay('original');
    const validCandidate = replay('candidate');
    const build = (
      oldReplay: CopilotSimulationResponse,
      candidateReplay: CopilotSimulationResponse,
    ) =>
      buildMayaEvidencePacket({
        callout: 'Repeated challenge.',
        oldReplay,
        candidateReplay,
      });

    expect(() => build(replay('candidate'), validCandidate)).toThrow(
      'Old replay must use replayMode "original".',
    );
    expect(() => build(validOld, replay('original'))).toThrow(
      'Candidate replay must use replayMode "candidate".',
    );
    expect(() =>
      build(validOld, replay('candidate', { jobId: '999' })),
    ).toThrow('Replay job IDs differ');
    expect(() => build(validOld, replay('candidate', { endTurn: 19 }))).toThrow(
      'Replay bounds differ',
    );
    expect(() =>
      build(validOld, replay('candidate', { turns: [turn({ turn: 19 })] })),
    ).toThrow('Replay turn numbers differ');
    expect(() =>
      build(
        validOld,
        replay('candidate', {
          turns: [turn({ trigger: 'guard_message' })],
        }),
      ),
    ).toThrow('Replay triggers differ');
  });

  it('reports model, context, skipped-turn, and null-reply limitations', () => {
    const candidate = replay('candidate', {
      modelConfiguration: {
        model: 'openai/gpt-5.6-sol',
        maxRetries: 2,
        maxSteps: 4,
      },
      turns: [
        turn({
          skipped: true,
          guardReplies: [
            {
              reply: null,
              source: 'simulated',
              historicalReply: 'Historical response',
            },
          ],
        }),
      ],
    });
    const packet = buildMayaEvidencePacket({
      callout: 'Copilot should stay silent.',
      oldReplay: replay('original'),
      candidateReplay: candidate,
    });

    expect(packet.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('model configurations differ'),
        expect.stringContaining(
          'context parity could not be independently verified',
        ),
        expect.stringContaining('candidate turn 18 was skipped'),
        expect.stringContaining(
          'candidate turn 18 uses a simulated guard reply',
        ),
        expect.stringContaining(
          'candidate turn 18 has a null simulated guard reply',
        ),
      ]),
    );
  });

  it('builds judge input with evidence and measurements only', () => {
    const input = buildMayaJudgeInput({
      callout: 'The Copilot flagged the guard.',
      oldReplay: replay('original'),
      candidateReplay: replay('candidate'),
    });

    expect(Object.keys(input)).toEqual(['evidence', 'measurements']);
    expect(input.measurements.selectedKinds).toContain('flags');
    expect(mayaJudgeInputSchema.parse(input)).toEqual(input);
  });
});
