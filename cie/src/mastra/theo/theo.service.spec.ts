jest.mock('./runner', () => ({
  runTheo: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { runTheo } from './runner';
import { TheoService } from './theo.service';

const mockedRunTheo = jest.mocked(runTheo);

describe('TheoService', () => {
  const service = new TheoService();
  const request = {
    whatWentWrong: 'Copilot repeatedly challenged a completed patrol.',
    badResponses: [{ jobId: '56370', startTurn: 9, endTurn: 16 }],
    expectedBehavior: 'Acknowledge the credible completion report.',
  };

  beforeEach(() => {
    mockedRunTheo.mockReset();
  });

  it('runs the complete Theo workflow and exposes the prompt suggestion', async () => {
    const proposedEdit = {
      file: 'core/obligations.md',
      old_text: 'Old prompt text.',
      new_text: 'New prompt text.',
      intended_effect: 'Avoid repeated pushback.',
    };
    const candidate = {
      kind: 'prompt' as const,
      summary: 'Prompt fix.',
      rationale: 'Prompt caused the issue.',
      expected_behavior: request.expectedBehavior,
      validation_plan: ['Replay and judge.'],
      risks: [],
      prompt_edit: proposedEdit,
    };
    const backtestRecord = {
      runId: 'theo-test',
      createdAt: '2026-09-10T00:00:00.000Z',
      candidateKind: 'prompt' as const,
      canReplay: true,
      jobId: '56370',
      startTurn: 9,
      endTurn: 16,
      expectedBehavior: request.expectedBehavior,
      candidate,
    };
    mockedRunTheo.mockResolvedValue({
      runId: 'theo-test',
      artifactDirectory: '/tmp/theo-test',
      diagnosis: { proposed_edit: proposedEdit } as never,
      candidate,
      canReplay: true,
      backtestRecord,
      candidatePromptJobId: '56370',
      candidatePromptVersion: '0.1',
      candidatePromptRoot: '/tmp/prompt-versions/job-56370-0.1',
    });

    await expect(service.diagnose(request)).resolves.toEqual({
      runId: 'theo-test',
      artifactDirectory: '/tmp/theo-test',
      diagnosis: { proposed_edit: proposedEdit },
      candidate,
      canReplay: true,
      backtestRecord,
      candidatePromptJobId: '56370',
      candidatePromptVersion: '0.1',
      candidatePromptRoot: '/tmp/prompt-versions/job-56370-0.1',
      suggestedPromptChange: proposedEdit,
    });
    expect(mockedRunTheo).toHaveBeenCalledWith({
      request,
      backtestDebugging: undefined,
    });
  });

  it('returns a bad request before running Theo for invalid input', async () => {
    await expect(
      service.diagnose({ ...request, badResponses: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedRunTheo).not.toHaveBeenCalled();
  });

  it('accepts simTarget without requiring jobId or turn bounds', async () => {
    const candidate = {
      kind: 'prompt' as const,
      summary: 'Prompt fix.',
      rationale: 'Prompt caused the issue.',
      expected_behavior: request.expectedBehavior,
      validation_plan: ['Replay and judge.'],
      risks: [],
    };
    mockedRunTheo.mockResolvedValue({
      runId: 'theo-simulation-test',
      artifactDirectory: '/tmp/theo-simulation-test',
      diagnosis: { proposed_edit: {} } as never,
      candidate,
      canReplay: true,
      backtestRecord: {
        runId: 'theo-simulation-test',
        createdAt: '2026-09-10T00:00:00.000Z',
        candidateKind: 'prompt',
        canReplay: true,
        jobId: '56370',
        startTurn: 9,
        endTurn: 16,
        expectedBehavior: request.expectedBehavior,
        candidate,
      },
      candidatePromptJobId: '56370',
      candidatePromptVersion: '0.2',
      candidatePromptRoot: '/tmp/prompt-versions/job-56370-0.2',
    });
    const simulationRequest = {
      ...request,
      badResponses: [{ simTarget: 3 }],
    };

    await service.diagnose(simulationRequest);

    expect(mockedRunTheo).toHaveBeenCalledWith({ request: simulationRequest });
  });
});
