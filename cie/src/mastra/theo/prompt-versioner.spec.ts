import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createCandidatePromptVersion } from './prompt-versioner';

const promptRoot = resolve(process.cwd(), '..', 'prompts');
const oldText =
  'If the guard answers, the ask is done. Ack it and close the loop.';
const newText =
  'If the guard gives a credible answer, acknowledge it and close the loop.';

describe('candidate prompt versioner', () => {
  let versionsRoot: string;

  beforeEach(async () => {
    versionsRoot = await mkdtemp(resolve(tmpdir(), 'prompt-versions-'));
  });

  afterEach(async () => {
    await rm(versionsRoot, { recursive: true, force: true });
  });

  it('copies prompts, applies one edit, and leaves original unchanged', async () => {
    const originalBefore = await readFile(
      resolve(promptRoot, 'core', 'obligations.md'),
      'utf8',
    );

    const candidate = await createCandidatePromptVersion({
      promptRoot,
      versionsRoot,
      jobId: '56370',
      runId: 'theo-test',
      edit: {
        file: 'core/obligations.md',
        old_text: oldText,
        new_text: newText,
        intended_effect: 'Close completed asks.',
      },
    });

    const candidateContents = await readFile(
      resolve(candidate.promptRoot, 'core', 'obligations.md'),
      'utf8',
    );
    const originalAfter = await readFile(
      resolve(promptRoot, 'core', 'obligations.md'),
      'utf8',
    );
    const manifest = JSON.parse(
      await readFile(resolve(candidate.promptRoot, 'version.json'), 'utf8'),
    ) as Record<string, unknown>;

    expect(candidate.version).toBe('0.1');
    expect(candidate.jobId).toBe('56370');
    expect(candidate.promptRoot).toBe(resolve(versionsRoot, 'job-56370-0.1'));
    expect(candidateContents).toContain(newText);
    expect(candidateContents).not.toContain(oldText);
    expect(originalAfter).toBe(originalBefore);
    expect(await readdir(candidate.promptRoot)).toEqual([
      'core',
      'decision.json',
      'instructions',
      'prompt.diff',
      'version.json',
    ]);
    expect(manifest).toMatchObject({
      jobId: '56370',
      version: '0.1',
      sourceVersion: 'original',
      runId: 'theo-test',
      changedFile: 'core/obligations.md',
      oldText,
      newText,
      intendedEffect: 'Close completed asks.',
    });
    expect(typeof manifest.sourceFileHash).toBe('string');
    expect(typeof manifest.candidateFileHash).toBe('string');
    expect(manifest.sourceFileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.candidateFileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(candidate.diff).toContain(
      '+++ prompt-versions/job-56370-0.1/core/obligations.md',
    );
  });

  it('increments versions without overwriting earlier candidates', async () => {
    const create = () =>
      createCandidatePromptVersion({
        promptRoot,
        versionsRoot,
        jobId: '56370',
        runId: 'theo-test',
        edit: {
          file: 'core/obligations.md',
          old_text: oldText,
          new_text: newText,
          intended_effect: 'Close completed asks.',
        },
      });

    const first = await create();
    const second = await create();

    expect(first.version).toBe('0.1');
    expect(second.version).toBe('0.2');
    expect(await readdir(versionsRoot)).toEqual([
      'job-56370-0.1',
      'job-56370-0.2',
    ]);
  });

  it('rejects non-mutable targets before creating a version', async () => {
    await expect(
      createCandidatePromptVersion({
        promptRoot,
        versionsRoot,
        jobId: '56370',
        runId: 'theo-test',
        edit: {
          file: 'ASSEMBLED_SYSTEM_PROMPT.md',
          old_text: oldText,
          new_text: newText,
          intended_effect: 'Invalid target.',
        },
      }),
    ).rejects.toThrow('not mutable');
    expect(await readdir(versionsRoot)).toEqual([]);
  });

  it('starts an independent version sequence for each job', async () => {
    const create = (jobId: string) =>
      createCandidatePromptVersion({
        promptRoot,
        versionsRoot,
        jobId,
        runId: `theo-${jobId}`,
        edit: {
          file: 'core/obligations.md',
          old_text: oldText,
          new_text: newText,
          intended_effect: 'Close completed asks.',
        },
      });

    const firstJob = await create('56370');
    const secondJob = await create('50837');

    expect(firstJob.version).toBe('0.1');
    expect(secondJob.version).toBe('0.1');
    expect(await readdir(versionsRoot)).toEqual([
      'job-50837-0.1',
      'job-56370-0.1',
    ]);
  });

  it('rejects unsafe job IDs before creating a version', async () => {
    await expect(
      createCandidatePromptVersion({
        promptRoot,
        versionsRoot,
        jobId: '../56370',
        runId: 'theo-test',
        edit: {
          file: 'core/obligations.md',
          old_text: oldText,
          new_text: newText,
          intended_effect: 'Invalid job ID.',
        },
      }),
    ).rejects.toThrow('job ID');
    expect(await readdir(versionsRoot)).toEqual([]);
  });
});
