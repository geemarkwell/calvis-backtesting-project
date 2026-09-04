jest.mock('./runner', () => ({
  runMaya: jest.fn(),
}));

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { MayaRunResult, RunMayaInput } from './runner';
import { loadPreparedMayaInput, runMayaCli } from './cli';

describe('Maya CLI', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'maya-cli-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('loads one prepared replay JSON file and calls the runner', async () => {
    const path = resolve(temporaryDirectory, 'prepared.json');
    const prepared = {
      callout: 'Copilot repeatedly challenged a completed patrol report.',
      oldReplay: { jobId: '56370' },
      candidateReplay: { jobId: '56370' },
    };
    await writeFile(path, JSON.stringify(prepared), 'utf8');

    const expected = {
      runId: 'maya-test',
      artifactDirectory: resolve(temporaryDirectory, 'maya-test'),
      input: {},
      verdict: {},
      judgment: {},
    } as MayaRunResult;
    const judge = jest.fn((input: RunMayaInput): Promise<MayaRunResult> => {
      void input;
      return Promise.resolve(expected);
    });

    await expect(runMayaCli([path], judge)).resolves.toBe(expected);
    expect(judge).toHaveBeenCalledWith(prepared);
  });

  it('rejects malformed prepared input and invalid argument counts', async () => {
    const path = resolve(temporaryDirectory, 'invalid.json');
    await writeFile(
      path,
      JSON.stringify({ callout: 'missing replays' }),
      'utf8',
    );

    await expect(loadPreparedMayaInput(path)).rejects.toThrow(
      'must contain callout, oldReplay, and candidateReplay',
    );
    await expect(runMayaCli([])).rejects.toThrow('Usage:');
    await expect(runMayaCli(['one.json', 'two.json'])).rejects.toThrow(
      'Usage:',
    );
  });
});
