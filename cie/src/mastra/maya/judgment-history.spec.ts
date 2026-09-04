import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { CopilotSimulationResponse } from '../../copilot-simulation/copilot-simulation.types';
import type { MayaVerdict } from './schemas';
import {
  createMayaJudgmentRecord,
  listMayaJudgments,
} from './judgment-history';

const verdict: MayaVerdict = {
  fixed: true,
  verdict: 'yes',
  summary: 'Candidate fixed the called-out behavior.',
  confidence: 86,
  criteria: [
    {
      claim: 'Repeated requests stopped.',
      old_measurement: 2,
      candidate_measurement: 0,
      passed: true,
      evidence: ['old:turn:9', 'candidate:turn:9'],
    },
  ],
  limitations: [],
};

function replay(
  jobId: string,
  simulationNumber: number,
): CopilotSimulationResponse {
  return {
    jobId,
    simulationNumber,
    logFile: `database/simulate-${simulationNumber}.json`,
  } as CopilotSimulationResponse;
}

describe('Maya judgment history', () => {
  let runsRoot: string;

  beforeEach(async () => {
    runsRoot = await mkdtemp(resolve(tmpdir(), 'maya-history-'));
  });

  afterEach(async () => {
    await rm(runsRoot, { recursive: true, force: true });
  });

  it('creates a job-linked record with both simulation references', () => {
    expect(
      createMayaJudgmentRecord({
        runId: 'maya-new',
        judgedAt: '2026-09-04T12:00:00.000Z',
        callout: 'Copilot repeated the request.',
        oldReplay: replay('56370', 11),
        candidateReplay: replay('56370', 12),
        verdict,
      }),
    ).toMatchObject({
      version: 1,
      jobId: '56370',
      oldReplay: {
        simulationNumber: 11,
        logFile: 'database/simulate-11.json',
      },
      candidateReplay: {
        simulationNumber: 12,
        logFile: 'database/simulate-12.json',
      },
      verdict,
    });
  });

  it('lists only the requested job in chronological order', async () => {
    const records = [
      createMayaJudgmentRecord({
        runId: 'maya-later',
        judgedAt: '2026-09-04T12:02:00.000Z',
        callout: 'Later judgment.',
        oldReplay: replay('56370', 12),
        candidateReplay: replay('56370', 13),
        verdict: { ...verdict, confidence: 91 },
      }),
      createMayaJudgmentRecord({
        runId: 'maya-earlier',
        judgedAt: '2026-09-04T12:01:00.000Z',
        callout: 'Earlier judgment.',
        oldReplay: replay('56370', 11),
        candidateReplay: replay('56370', 12),
        verdict,
      }),
      createMayaJudgmentRecord({
        runId: 'maya-other-job',
        judgedAt: '2026-09-04T12:00:00.000Z',
        callout: 'Other job.',
        oldReplay: replay('50837', 20),
        candidateReplay: replay('50837', 21),
        verdict,
      }),
    ];

    for (const record of records) {
      const directory = resolve(runsRoot, record.runId);
      await mkdir(directory);
      await writeFile(
        resolve(directory, 'judgment.json'),
        JSON.stringify(record),
        'utf8',
      );
    }

    const history = await listMayaJudgments({ jobId: '56370', runsRoot });

    expect(history.jobId).toBe('56370');
    expect(history.judgments.map((record) => record.runId)).toEqual([
      'maya-earlier',
      'maya-later',
    ]);
    expect(
      history.judgments.map((record) => record.verdict.confidence),
    ).toEqual([86, 91]);
  });

  it('returns an empty history for a missing runs directory', async () => {
    await expect(
      listMayaJudgments({
        jobId: '56370',
        runsRoot: resolve(runsRoot, 'missing'),
      }),
    ).resolves.toEqual({ jobId: '56370', judgments: [] });
  });

  it('includes legacy judgments with unavailable metadata marked null', async () => {
    const runId = 'maya-legacy';
    const directory = resolve(runsRoot, runId);
    const timestamp = '2026-09-04T12:00:00.000Z';
    const trajectory = (name: 'historical' | 'old' | 'candidate') => ({
      name,
      turns: [
        {
          ref: `${name}:turn:9`,
          turn: 9,
          trigger: 'guard_message',
          timestamp,
          events: [],
          guardReplies: [],
          copilotMessages: [],
          actions: [],
          silent: true,
          skipped: false,
        },
      ],
    });
    const legacyVerdict: Partial<MayaVerdict> = { ...verdict };
    delete legacyVerdict.confidence;

    await mkdir(directory);
    await Promise.all([
      writeFile(
        resolve(directory, 'evidence-packet.json'),
        JSON.stringify({
          callout: 'Legacy callout.',
          jobId: '56370',
          startTurn: 9,
          endTurn: 9,
          trajectories: {
            historical: trajectory('historical'),
            old: trajectory('old'),
            candidate: trajectory('candidate'),
          },
          warnings: [],
        }),
        'utf8',
      ),
      writeFile(
        resolve(directory, 'verdict.json'),
        JSON.stringify(legacyVerdict),
        'utf8',
      ),
    ]);

    const history = await listMayaJudgments({ jobId: '56370', runsRoot });

    expect(history.judgments).toHaveLength(1);
    expect(history.judgments[0]).toMatchObject({
      version: 0,
      runId,
      jobId: '56370',
      oldReplay: { simulationNumber: null, logFile: null },
      candidateReplay: { simulationNumber: null, logFile: null },
      verdict: { confidence: null },
    });
  });

  it('rejects invalid job IDs', async () => {
    await expect(
      listMayaJudgments({ jobId: '../56370', runsRoot }),
    ).rejects.toThrow('digits only');
  });
});
