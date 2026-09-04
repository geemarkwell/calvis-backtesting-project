jest.mock('./copilot-simulation.service', () => ({
  CopilotSimulationService: class CopilotSimulationService {},
}));
jest.mock('./copilot-original.service', () => ({
  CopilotOriginalService: class CopilotOriginalService {},
}));
jest.mock('../mastra/maya/maya-judgment.service', () => ({
  MayaJudgmentService: class MayaJudgmentService {},
}));
jest.mock('../mastra/theo/theo.service', () => ({
  TheoService: class TheoService {},
}));
jest.mock('../mastra/theo/candidate-decision.service', () => ({
  CandidateDecisionService: class CandidateDecisionService {},
}));

import { BadRequestException } from '@nestjs/common';
import { CopilotBacktestService } from './copilot-backtest.service';

describe('CopilotBacktestService', () => {
  const oldReplay = {
    jobId: '56370',
    startTurn: 8,
    endTurn: 11,
    replayMode: 'original',
  };
  const candidateReplay = {
    jobId: '56370',
    startTurn: 8,
    endTurn: 11,
    replayMode: 'candidate',
    updatedPrompt: {
      jobId: '56370',
      version: '0.1',
      file: 'core/obligations.md',
      oldText: 'Old text.',
      newText: 'New text.',
      intendedEffect: 'Improve behavior.',
    },
  };
  const originalService = { getOriginal: jest.fn() };
  const simulationService = { simulate: jest.fn() };
  const mayaJudgmentService = { judge: jest.fn() };
  const theoResult = {
    runId: 'theo-56370',
    artifactDirectory: 'runs/theo-56370',
    candidatePromptJobId: '56370',
    candidatePromptVersion: '0.1',
    candidatePromptRoot: 'prompt-versions/job-56370-0.1',
    diagnosis: { proposed_edit: {} },
    suggestedPromptChange: {},
  };
  const pendingDecision = {
    jobId: '56370',
    version: '0.1',
    status: 'pending',
    createdAt: '2026-09-04T01:00:00.000Z',
    decidedAt: null,
    evaluation: null,
  };
  const theoService = { diagnose: jest.fn() };
  const candidateDecisionService = {
    recordEvaluation: jest.fn(),
    get: jest.fn(),
  };
  const service = new CopilotBacktestService(
    simulationService,
    originalService as never,
    mayaJudgmentService as never,
    theoService,
    candidateDecisionService as never,
  );
  const input = {
    jobId: '56370',
    startTurn: 8,
    endTurn: 11,
    replayMode: 'candidate' as const,
    callNiko: false,
    debug: false,
    callout: '  Copilot pushed too hard.  ',
    expectedBehavior: '  Acknowledge credible completed patrols.  ',
    baselineSource: 'shift' as const,
  };

  beforeEach(() => {
    originalService.getOriginal.mockReset().mockResolvedValue(oldReplay);
    simulationService.simulate.mockReset().mockResolvedValue(candidateReplay);
    mayaJudgmentService.judge.mockReset();
    theoService.diagnose.mockReset().mockResolvedValue(theoResult);
    candidateDecisionService.recordEvaluation.mockReset();
    candidateDecisionService.get.mockReset().mockResolvedValue({
      decision: pendingDecision,
      updatedPrompt: candidateReplay.updatedPrompt,
    });
  });

  it('runs original, candidate, and Maya as one backtest', async () => {
    const maya = {
      runId: 'maya-56370-1',
      artifactDirectory: 'runs/maya-56370-1',
      input: { hidden: true },
      verdict: {
        fixed: true,
        verdict: 'yes',
        confidence: 92,
        summary: 'Candidate fixed the behavior.',
      },
      judgment: {
        runId: 'maya-56370-1',
        judgedAt: '2026-09-04T02:00:00.000Z',
      },
    };
    mayaJudgmentService.judge.mockResolvedValue(maya);
    candidateDecisionService.recordEvaluation.mockResolvedValue({
      decision: {
        ...pendingDecision,
        evaluation: {
          runId: maya.runId,
          judgedAt: maya.judgment.judgedAt,
          fixed: true,
          verdict: 'yes',
          confidence: 92,
          summary: 'Candidate fixed the behavior.',
        },
      },
      updatedPrompt: candidateReplay.updatedPrompt,
    });

    await expect(service.run(input)).resolves.toEqual({
      theo: theoResult,
      oldReplay,
      candidateReplay,
      updatedPrompt: candidateReplay.updatedPrompt,
      candidateDecision: {
        ...pendingDecision,
        evaluation: {
          runId: maya.runId,
          judgedAt: maya.judgment.judgedAt,
          fixed: true,
          verdict: 'yes',
          confidence: 92,
          summary: 'Candidate fixed the behavior.',
        },
      },
      maya: {
        runId: maya.runId,
        artifactDirectory: maya.artifactDirectory,
        verdict: maya.verdict,
        judgment: maya.judgment,
      },
      mayaError: null,
    });
    expect(theoService.diagnose).toHaveBeenCalledWith({
      whatWentWrong: 'Copilot pushed too hard.',
      expectedBehavior: 'Acknowledge credible completed patrols.',
      badResponses: [{ jobId: '56370', startTurn: 8, endTurn: 11 }],
    });
    expect(originalService.getOriginal).toHaveBeenCalledWith({
      jobId: '56370',
      startTurn: 8,
      endTurn: 11,
      source: 'shift',
      simulationNumber: undefined,
    });
    expect(simulationService.simulate).toHaveBeenCalledWith({
      jobId: '56370',
      startTurn: 8,
      endTurn: 11,
      replayMode: 'candidate',
      promptVersion: '0.1',
      callNiko: false,
      debug: false,
    });
    expect(mayaJudgmentService.judge).toHaveBeenCalledWith({
      callout: 'Copilot pushed too hard.',
      oldReplay,
      candidateReplay,
    });
    expect(candidateDecisionService.recordEvaluation).toHaveBeenCalledWith(
      { jobId: '56370', version: '0.1' },
      {
        runId: maya.runId,
        judgedAt: maya.judgment.judgedAt,
        fixed: true,
        verdict: 'yes',
        confidence: 92,
        summary: 'Candidate fixed the behavior.',
      },
    );
  });

  it('returns completed replays when Maya fails', async () => {
    mayaJudgmentService.judge.mockRejectedValue(new Error('Judge unavailable'));

    await expect(service.run(input)).resolves.toEqual({
      theo: theoResult,
      oldReplay,
      candidateReplay,
      updatedPrompt: candidateReplay.updatedPrompt,
      candidateDecision: pendingDecision,
      maya: null,
      mayaError: 'Judge unavailable',
    });
  });

  it('uses a selected saved simulation as Theo evidence', async () => {
    mayaJudgmentService.judge.mockRejectedValue(new Error('Judge unavailable'));

    await service.run({
      ...input,
      baselineSource: 'simulation',
      baselineSimulationNumber: 7,
    });

    expect(theoService.diagnose).toHaveBeenCalledWith(
      expect.objectContaining({
        badResponses: [{ simTarget: 7, startTurn: 8, endTurn: 11 }],
      }),
    );
  });

  it('rejects missing inputs, manual versions, or original replay mode', async () => {
    await expect(service.run({ ...input, callout: ' ' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.run({ ...input, replayMode: 'original' }),
    ).rejects.toThrow('require replayMode "candidate"');
    await expect(
      service.run({ ...input, expectedBehavior: ' ' }),
    ).rejects.toThrow('expectedBehavior is required');
    await expect(
      service.run({ ...input, promptVersion: '0.1' }),
    ).rejects.toThrow('created automatically by Theo');
    expect(simulationService.simulate).not.toHaveBeenCalled();
    expect(mayaJudgmentService.judge).not.toHaveBeenCalled();
  });
});
