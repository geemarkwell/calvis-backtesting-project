import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadCandidatePrompt } from './candidate-prompt-loader';

describe('candidate prompt loader', () => {
  let versionsRoot: string;

  beforeEach(async () => {
    versionsRoot = await mkdtemp(resolve(tmpdir(), 'candidate-loader-'));
  });

  afterEach(async () => {
    await rm(versionsRoot, { recursive: true, force: true });
  });

  it('loads exact job version and returns its recorded prompt change', async () => {
    await writeCandidate({ jobId: '56370', version: '0.1' });

    await expect(
      loadCandidatePrompt({ versionsRoot, jobId: '56370', version: '0.1' }),
    ).resolves.toEqual({
      promptRoot: resolve(versionsRoot, 'job-56370-0.1'),
      updatedPrompt: {
        jobId: '56370',
        version: '0.1',
        file: 'core/obligations.md',
        oldText: 'Old text.',
        newText: 'New text.',
        intendedEffect: 'Improve behavior.',
      },
      sourceFileHash: hash('Old text.'),
      candidateFileHash: hash('New text.'),
    });
  });

  it('rejects missing, malformed, and cross-job versions', async () => {
    await expect(
      loadCandidatePrompt({ versionsRoot, jobId: '56370', version: '1.0' }),
    ).rejects.toThrow('must use 0.<positive integer>');
    await expect(
      loadCandidatePrompt({ versionsRoot, jobId: '56370', version: '0.1' }),
    ).rejects.toThrow('not found');

    await writeCandidate({
      jobId: '56370',
      version: '0.1',
      manifestJobId: '50837',
    });
    await expect(
      loadCandidatePrompt({ versionsRoot, jobId: '56370', version: '0.1' }),
    ).rejects.toThrow('does not match');
  });

  it('rejects a candidate file that lacks its recorded replacement', async () => {
    await writeCandidate({
      jobId: '56370',
      version: '0.1',
      promptContents: 'Different text.',
    });

    await expect(
      loadCandidatePrompt({ versionsRoot, jobId: '56370', version: '0.1' }),
    ).rejects.toThrow('does not contain recorded replacement');
  });

  async function writeCandidate({
    jobId,
    version,
    manifestJobId = jobId,
    promptContents = 'New text.',
  }: {
    jobId: string;
    version: string;
    manifestJobId?: string;
    promptContents?: string;
  }) {
    const root = resolve(versionsRoot, `job-${jobId}-${version}`);
    await mkdir(resolve(root, 'core'), { recursive: true });
    await writeFile(
      resolve(root, 'core', 'obligations.md'),
      promptContents,
      'utf8',
    );
    await writeFile(
      resolve(root, 'version.json'),
      JSON.stringify({
        jobId: manifestJobId,
        version,
        changedFile: 'core/obligations.md',
        oldText: 'Old text.',
        newText: 'New text.',
        intendedEffect: 'Improve behavior.',
        sourceFileHash: hash('Old text.'),
        candidateFileHash: hash(promptContents),
      }),
      'utf8',
    );
  }
});

function hash(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}
