import { buildTestEvaluationEvidencePacket } from './evidence-packet';

const testSpec = {
  id: 'politeness-test',
  version: '1',
  name: 'Politeness test',
  userQuestion: 'Is the agent polite to the guard?',
  agentSurface: 'copilot_behavior',
  criteria: [
    {
      id: 'respectful-tone',
      importance: 'critical' as const,
      description: 'Uses respectful tone.',
      passRule: 'No insulting or accusatory wording.',
    },
    {
      id: 'clear-request',
      importance: 'major' as const,
      description: 'Requests are clear.',
      passRule: 'Requests explain what is needed.',
    },
    {
      id: 'no-repeated-nagging',
      importance: 'major' as const,
      description: 'Avoids repeated nagging.',
      passRule: 'Does not repeat the same ask unnecessarily.',
    },
  ],
  requiredEvidence: ['copilot_messages'],
  passCondition: 'All critical criteria pass.',
  assumptions: [],
  limitations: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const replay = {
  jobId: '56370',
  status: 'completed' as const,
  startTurn: 9,
  endTurn: 9,
  replayMode: 'original' as const,
  callNiko: false as const,
  modelConfiguration: { model: 'recorded', maxRetries: 0, maxSteps: 0 },
  turns: [
    {
      turn: 9,
      trigger: 'guard_message',
      timestamp: '2026-01-01T01:00:00.000Z',
      shiftEvents: [],
      guardMessages: ['I checked both buildings.'],
      guardReplies: [],
      copilotMessages: ['Thanks. Please continue checking in.'],
      modelText: null,
      finishReason: 'recorded',
      toolCalls: [
        { tool: 'request_copilot_dm', input: { body: 'Thanks.' } },
      ],
      silent: false,
      skipped: false,
      candidateCopilotOutput: { messages: [], actions: [], silent: false },
      historicalCopilotOutput: { messages: [], actions: [], silent: false },
      diverged: false,
      divergedThisTurn: false,
    },
  ],
};

describe('buildTestEvaluationEvidencePacket', () => {
  it('creates stable refs for trace messages and actions', () => {
    const packet = buildTestEvaluationEvidencePacket(testSpec, replay);

    expect(packet.trace.jobId).toBe('56370');
    expect(packet.trace.turns[0].ref).toBe('trace:turn:9');
    expect(packet.trace.turns[0].guardMessages[0].ref).toBe(
      'trace:turn:9:guard-message:0',
    );
    expect(packet.trace.turns[0].copilotMessages[0].ref).toBe(
      'trace:turn:9:copilot-message:0',
    );
    expect(packet.trace.turns[0].actions[0].ref).toBe('trace:turn:9:action:0');
  });
});
