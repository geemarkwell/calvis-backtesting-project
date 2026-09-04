import type { RequestContext } from '@mastra/core/request-context';
import { resolve } from 'node:path';
import { copilot } from '../mastra/agents/copilot-agent';
import type { CopilotRequestContext } from '../mastra/copilot/types';
import { simulateGuard } from '../mastra/niko/simulator';
import { CopilotSimulationService } from './copilot-simulation.service';
import { writeSimulationLog } from './simulation-log-writer';
import { loadCandidatePrompt } from './candidate-prompt-loader';

jest.mock('../mastra/agents/copilot-agent', () => ({
  copilot: {
    generate: jest.fn(),
  },
  copilotModelConfiguration: {
    model: 'openai/gpt-5-mini',
    maxRetries: 0,
    maxSteps: 8,
  },
}));

jest.mock('../mastra/niko/simulator', () => ({
  simulateGuard: jest.fn(),
}));

jest.mock('./simulation-log-writer', () => ({
  writeSimulationLog: jest.fn(),
}));

jest.mock('./candidate-prompt-loader', () => ({
  loadCandidatePrompt: jest.fn(),
}));

const mockedCopilot = copilot as unknown as {
  generate: jest.Mock<
    Promise<never>,
    [unknown, { requestContext: RequestContext<CopilotRequestContext> }]
  >;
};
const mockedSimulateGuard = simulateGuard as jest.MockedFunction<
  typeof simulateGuard
>;
const mockedWriteSimulationLog = writeSimulationLog as jest.MockedFunction<
  typeof writeSimulationLog
>;
const mockedLoadCandidatePrompt = loadCandidatePrompt as jest.MockedFunction<
  typeof loadCandidatePrompt
>;

function modelResult(text = '') {
  return {
    text,
    finishReason: 'stop',
    response: { messages: [] },
  } as never;
}

describe('CopilotSimulationService', () => {
  const originalBundleRoot = process.env.CALVIS_BUNDLE_ROOT;
  let service: CopilotSimulationService;

  beforeEach(() => {
    process.env.CALVIS_BUNDLE_ROOT = resolveBundleRoot();
    service = new CopilotSimulationService();
    mockedCopilot.generate.mockReset();
    mockedSimulateGuard.mockReset();
    mockedWriteSimulationLog.mockReset();
    mockedLoadCandidatePrompt.mockReset();
    mockedWriteSimulationLog.mockResolvedValue({
      simulationNumber: 1,
      logFile: 'database/simulate-1.json',
    });
  });

  afterAll(() => {
    if (originalBundleRoot === undefined) {
      delete process.env.CALVIS_BUNDLE_ROOT;
    } else {
      process.env.CALVIS_BUNDLE_ROOT = originalBundleRoot;
    }
  });

  it('returns raw silence for scheduled wake with no outward action', async () => {
    mockedCopilot.generate.mockResolvedValue(modelResult());

    const response = await service.simulate({
      jobId: '50837',
      startTurn: 12,
      endTurn: 12,
    });

    expect(response.jobId).toBe('50837');
    expect(response.simulationNumber).toBe(1);
    expect(response.logFile).toBe('database/simulate-1.json');
    expect(response.turns).toHaveLength(1);
    expect(response.turns[0]).toMatchObject({
      turn: 12,
      trigger: 'scheduled_check_in',
      guardReplies: [],
      copilotMessages: [],
      silent: true,
      skipped: false,
      diverged: false,
    });
  });

  it('captures guard input and Copilot DM without evaluating it', async () => {
    mockedCopilot.generate.mockImplementation((_messages, options) => {
      const requestContext = options.requestContext;
      requestContext.set('copilot-observed-tool-calls', [
        {
          tool: 'request_copilot_dm',
          input: { body: 'Thanks for the patrol update.' },
        },
      ]);
      return Promise.resolve(modelResult());
    });

    const response = await service.simulate({
      jobId: '56370',
      startTurn: 9,
      endTurn: 9,
    });

    expect(response.turns[0].guardMessages).toContain(
      'There was nothing to report and there was nothing damage or any activity',
    );
    expect(response.turns[0].copilotMessages).toEqual([
      'Thanks for the patrol update.',
    ]);
    expect(response.turns[0].silent).toBe(false);
    expect(response.turns[0].guardReplies).toEqual([
      {
        reply:
          'There was nothing to report and there was nothing damage or any activity',
        source: 'historical',
        historicalReply:
          'There was nothing to report and there was nothing damage or any activity',
      },
    ]);
    expect(response.turns[0].diverged).toBe(true);
    expect(response).not.toHaveProperty('assessment');
    expect(mockedWriteSimulationLog).toHaveBeenCalledTimes(1);
    const logInput = mockedWriteSimulationLog.mock.calls[0][0];
    expect(logInput.bundleRoot).toBe(resolveBundleRoot());
    expect(logInput.simulation).toMatchObject({
      jobId: '56370',
      startTurn: 9,
      endTurn: 9,
    });
  });

  it('uses Niko for later guard replies after Copilot output diverges', async () => {
    mockedSimulateGuard.mockResolvedValue({
      reply: 'I already finished the whole patrol.',
    });
    mockedCopilot.generate
      .mockImplementationOnce((_messages, options) => {
        options.requestContext.set('copilot-observed-tool-calls', [
          {
            tool: 'request_copilot_dm',
            input: { body: 'Thanks for the update.' },
          },
        ]);
        return Promise.resolve(modelResult());
      })
      .mockImplementationOnce((messages) => {
        expect(JSON.stringify(messages)).toContain(
          'I already finished the whole patrol.',
        );
        return Promise.resolve(modelResult());
      });

    const response = await service.simulate({
      jobId: '56370',
      startTurn: 9,
      endTurn: 10,
    });

    expect(mockedSimulateGuard).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateCopilotMessage: 'Thanks for the update.',
        historicalGuardReply:
          'Yes I walk the whole site and I check the rear and there was no activity',
      }),
    );
    expect(response.turns[1].guardMessages).toEqual([
      'I already finished the whole patrol.',
    ]);
    expect(response.turns[1].guardReplies[0]).toMatchObject({
      source: 'simulated',
      historicalReply:
        'Yes I walk the whole site and I check the rear and there was no activity',
    });
    const replayedGuardEvent = response.turns
      .flatMap((turn) => turn.shiftEvents)
      .find((event) => event.type === 'guard_message');
    expect(typeof replayedGuardEvent?.ts).toBe('string');
    expect(response.turns[0].candidateCopilotOutput.messages).toEqual([
      'Thanks for the update.',
    ]);
  });

  it('always uses recorded guard replies when callNiko is false', async () => {
    mockedCopilot.generate
      .mockImplementationOnce((_messages, options) => {
        options.requestContext.set('copilot-observed-tool-calls', [
          {
            tool: 'request_copilot_dm',
            input: { body: 'Different candidate response.' },
          },
        ]);
        return Promise.resolve(modelResult());
      })
      .mockImplementationOnce((messages) => {
        expect(JSON.stringify(messages)).toContain(
          'Yes I walk the whole site and I check the rear and there was no activity',
        );
        return Promise.resolve(modelResult());
      });

    const response = await service.simulate({
      jobId: '56370',
      startTurn: 9,
      endTurn: 10,
      callNiko: false,
    });

    expect(mockedSimulateGuard).not.toHaveBeenCalled();
    expect(response.callNiko).toBe(false);
    expect(response.turns[1].guardReplies).toEqual([
      {
        reply:
          'Yes I walk the whole site and I check the rear and there was no activity',
        source: 'historical',
        historicalReply:
          'Yes I walk the whole site and I check the rear and there was no activity',
      },
    ]);
  });

  it('skips a guard-triggered turn when Niko returns null', async () => {
    mockedSimulateGuard.mockResolvedValue({ reply: null });
    mockedCopilot.generate.mockImplementationOnce((_messages, options) => {
      options.requestContext.set('copilot-observed-tool-calls', [
        {
          tool: 'request_copilot_dm',
          input: { body: 'Thanks for the update.' },
        },
      ]);
      return Promise.resolve(modelResult());
    });

    const response = await service.simulate({
      jobId: '56370',
      startTurn: 9,
      endTurn: 10,
    });

    expect(mockedCopilot.generate).toHaveBeenCalledTimes(1);
    expect(response.turns[1]).toMatchObject({
      turn: 10,
      guardMessages: [],
      guardReplies: [
        expect.objectContaining({ source: 'simulated', reply: null }),
      ],
      finishReason: 'not_run',
      skipped: true,
      silent: true,
      diverged: true,
    });
  });

  it('returns opt-in production inputs and chronological tool history', async () => {
    mockedCopilot.generate.mockResolvedValue(modelResult('No action needed.'));

    const response = await service.simulate({
      jobId: '56370',
      startTurn: 14,
      endTurn: 14,
      replayMode: 'candidate',
      debug: true,
    });

    expect(response).toMatchObject({
      replayMode: 'candidate',
      modelConfiguration: {
        model: 'openai/gpt-5-mini',
        maxRetries: 0,
        maxSteps: 8,
      },
    });
    const debug = response.turns[0].debug;
    expect(debug?.systemPrompt).toContain('# Who You Are');
    expect(debug?.turnMessage).toContain(
      '## Turn 14 (triggered by: guard_message)',
    );
    expect(debug?.turnMessage).not.toContain('Everything is all clear');
    expect(debug?.conversationHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: 'Everything is all clear',
        }),
        expect.objectContaining({ role: 'tool' }),
      ]),
    );
    const locationEvent = debug?.eventsSupplied.find(
      (event) => event.type === 'location',
    );
    const telemetryEvent = debug?.eventsSupplied.find(
      (event) => event.type === 'telemetry',
    );
    expect(typeof locationEvent?.ts).toBe('string');
    expect(typeof telemetryEvent?.ts).toBe('string');
  });

  it('uses the selected job prompt version and returns its exact edit', async () => {
    const updatedPrompt = {
      jobId: '56370',
      version: '0.1',
      file: 'core/obligations.md',
      oldText: 'Old prompt text.',
      newText: 'New prompt text.',
      intendedEffect: 'Improve behavior.',
    };
    mockedLoadCandidatePrompt.mockResolvedValue({
      promptRoot: resolveBundleRoot() + '/prompts',
      updatedPrompt,
      sourceFileHash: 'a'.repeat(64),
      candidateFileHash: 'b'.repeat(64),
    });
    mockedCopilot.generate.mockResolvedValue(modelResult());

    const response = await service.simulate({
      jobId: '56370',
      startTurn: 9,
      endTurn: 9,
      replayMode: 'candidate',
      promptVersion: '0.1',
    });

    expect(mockedLoadCandidatePrompt).toHaveBeenCalledWith({
      versionsRoot: resolve(resolveBundleRoot(), 'cie', 'prompt-versions'),
      jobId: '56370',
      version: '0.1',
    });
    expect(response.updatedPrompt).toEqual(updatedPrompt);
    expect(
      mockedWriteSimulationLog.mock.calls[0][0].simulation.updatedPrompt,
    ).toEqual(updatedPrompt);
  });

  it('rejects prompt versions outside candidate mode', async () => {
    await expect(
      service.simulate({
        jobId: '56370',
        startTurn: 9,
        endTurn: 9,
        replayMode: 'original',
        promptVersion: '0.1',
      }),
    ).rejects.toThrow('only with replayMode "candidate"');
    expect(mockedCopilot.generate).not.toHaveBeenCalled();
  });

  it('fails clearly when completed simulation cannot be logged', async () => {
    mockedCopilot.generate.mockResolvedValue(modelResult());
    mockedWriteSimulationLog.mockRejectedValue(new Error('disk full'));

    await expect(
      service.simulate({
        jobId: '50837',
        startTurn: 12,
        endTurn: 12,
      }),
    ).rejects.toThrow(
      'Copilot simulation completed but could not be logged: disk full',
    );
  });
});

function resolveBundleRoot(): string {
  return resolve(process.cwd(), '..');
}
