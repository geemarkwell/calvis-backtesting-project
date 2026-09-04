jest.mock('./judgment-history', () => ({
  listMayaJudgments: jest.fn(),
}));
jest.mock('./runner', () => ({
  runMaya: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { listMayaJudgments } from './judgment-history';
import { MayaJudgmentService } from './maya-judgment.service';
import { runMaya } from './runner';

const replay = (replayMode: 'original' | 'candidate') => ({
  jobId: '56370',
  status: 'completed' as const,
  startTurn: 8,
  endTurn: 11,
  replayMode,
  callNiko: false,
  modelConfiguration: { model: 'test', maxRetries: 0, maxSteps: 1 },
  turns: [{}],
  simulationNumber: replayMode === 'candidate' ? 3 : 2,
  logFile: `simulate-${replayMode}.json`,
});

describe('MayaJudgmentService', () => {
  const service = new MayaJudgmentService();

  beforeEach(() => {
    jest.mocked(listMayaJudgments).mockReset();
    jest.mocked(runMaya).mockReset();
  });

  it('runs Maya for comparable replay results', async () => {
    const result = { runId: 'maya-56370-1' };
    jest.mocked(runMaya).mockResolvedValue(result as never);
    const oldReplay = replay('original');
    const candidateReplay = replay('candidate');

    await expect(
      service.judge({
        callout: '  Copilot pushed too hard.  ',
        oldReplay,
        candidateReplay,
      }),
    ).resolves.toBe(result);
    expect(runMaya).toHaveBeenCalledWith({
      callout: 'Copilot pushed too hard.',
      oldReplay,
      candidateReplay,
    });
  });

  it('rejects missing callout and non-candidate comparisons', async () => {
    await expect(
      service.judge({
        callout: ' ',
        oldReplay: replay('original'),
        candidateReplay: replay('candidate'),
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.judge({
        callout: 'Copilot pushed too hard.',
        oldReplay: replay('original'),
        candidateReplay: replay('original'),
      }),
    ).rejects.toThrow('candidateReplay must use replayMode "candidate".');
  });

  it('loads history for a normalized job ID', async () => {
    jest.mocked(listMayaJudgments).mockResolvedValue({
      jobId: '56370',
      judgments: [],
    });

    await expect(service.getHistory({ jobId: 56370 })).resolves.toEqual({
      jobId: '56370',
      judgments: [],
    });
    expect(listMayaJudgments).toHaveBeenCalledWith({ jobId: '56370' });
  });

  it('rejects a missing or malformed job ID', () => {
    expect(() => service.getHistory({})).toThrow(BadRequestException);
    expect(() => service.getHistory({ jobId: '../56370' })).toThrow(
      BadRequestException,
    );
  });
});
