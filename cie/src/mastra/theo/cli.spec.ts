jest.mock('./runner', () => ({ runTheo: jest.fn() }));

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { TheoRunResult } from './runner';
import { loadTheoRequest, runTheoCli } from './cli';

describe('Theo CLI', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'theo-cli-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('loads one structured request file and invokes Theo', async () => {
    const path = resolve(temporaryDirectory, 'request.json');
    const request = {
      whatWentWrong: 'Copilot repeatedly pushed back.',
      badResponses: [{ jobId: '56370', startTurn: 9, endTurn: 16 }],
      expectedBehavior: 'Acknowledge credible completion reports.',
    };
    await writeFile(path, JSON.stringify(request), 'utf8');
    const expected = {
      runId: 'theo-test',
      artifactDirectory: temporaryDirectory,
      diagnosis: {},
      candidatePromptJobId: '56370',
      candidatePromptVersion: '0.1',
      candidatePromptRoot: resolve(temporaryDirectory, 'job-56370-0.1'),
    } as TheoRunResult;
    const diagnose = jest.fn(() => Promise.resolve(expected));

    await expect(runTheoCli([path], diagnose)).resolves.toBe(expected);
    expect(diagnose).toHaveBeenCalledWith({ request });
  });

  it('rejects malformed requests and invalid argument counts', async () => {
    const path = resolve(temporaryDirectory, 'bad.json');
    await writeFile(
      path,
      JSON.stringify({ whatWentWrong: 'Missing other fields.' }),
      'utf8',
    );

    await expect(loadTheoRequest(path)).rejects.toThrow();
    await expect(runTheoCli([])).rejects.toThrow(
      'Usage: yarn theo:diagnose <request.json>',
    );
    await expect(runTheoCli(['one.json', 'two.json'])).rejects.toThrow(
      'Usage: yarn theo:diagnose <request.json>',
    );
  });
});
