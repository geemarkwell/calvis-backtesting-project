import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { CandidateDecisionService } from './candidate-decision.service';
import { createCandidatePromptVersion } from './prompt-versioner';

const sourcePromptRoot = resolve(process.cwd(), '..', 'prompts');
const oldText =
  'If the guard answers, the ask is done. Ack it and close the loop.';
const newText =
  'If the guard gives a credible answer, acknowledge it and close the loop.';
const evaluation = {
  runId: 'maya-56370-1',
  judgedAt: '2026-09-04T02:00:00.000Z',
  fixed: true,
  verdict: 'yes' as const,
  confidence: 91,
  summary: 'Candidate fixed the behavior.',
};

describe('CandidateDecisionService', () => {
  const originalBundleRoot = process.env.CALVIS_BUNDLE_ROOT;
  let bundleRoot: string;
  let service: CandidateDecisionService;

  beforeEach(async () => {
    bundleRoot = await mkdtemp(resolve(tmpdir(), 'candidate-decision-'));
    await cp(sourcePromptRoot, resolve(bundleRoot, 'prompts'), {
      recursive: true,
    });
    await mkdir(resolve(bundleRoot, 'shifts'));
    process.env.CALVIS_BUNDLE_ROOT = bundleRoot;
    service = new CandidateDecisionService();
    await createCandidatePromptVersion({
      promptRoot: resolve(bundleRoot, 'prompts'),
      versionsRoot: resolve(bundleRoot, 'cie', 'prompt-versions'),
      jobId: '56370',
      runId: 'theo-56370',
      edit: {
        file: 'core/obligations.md',
        old_text: oldText,
        new_text: newText,
        intended_effect: 'Close credible completed asks.',
      },
    });
  });

  afterEach(async () => {
    await rm(bundleRoot, { recursive: true, force: true });
    if (originalBundleRoot === undefined) {
      delete process.env.CALVIS_BUNDLE_ROOT;
    } else {
      process.env.CALVIS_BUNDLE_ROOT = originalBundleRoot;
    }
  });

  it('promotes one evaluated candidate atomically and idempotently', async () => {
    await service.recordEvaluation(
      { jobId: '56370', version: '0.1' },
      evaluation,
    );

    const first = await service.accept({ jobId: '56370', version: '0.1' });
    const second = await service.accept({ jobId: '56370', version: '0.1' });
    const canonical = await readFile(
      resolve(bundleRoot, 'prompts', 'core', 'obligations.md'),
      'utf8',
    );

    expect(first.decision).toMatchObject({
      status: 'accepted',
      evaluation,
    });
    expect(first.decision.decidedAt).toEqual(expect.any(String));
    expect(second.decision).toEqual(first.decision);
    expect(canonical).toContain(newText);
    expect(canonical).not.toContain(oldText);
  });

  it('rejects idempotently without changing the real prompt', async () => {
    const before = await canonicalPrompt();
    const first = await service.reject({ jobId: '56370', version: '0.1' });
    const second = await service.reject({ jobId: '56370', version: '0.1' });

    expect(first.decision.status).toBe('rejected');
    expect(second.decision).toEqual(first.decision);
    expect(await canonicalPrompt()).toBe(before);
    await expect(
      service.accept({ jobId: '56370', version: '0.1' }),
    ).rejects.toThrow('cannot be accepted');
  });

  it('requires Maya evaluation before acceptance', async () => {
    await expect(
      service.accept({ jobId: '56370', version: '0.1' }),
    ).rejects.toThrow('has not been evaluated by Maya');
    expect(await canonicalPrompt()).toContain(oldText);
  });

  it('refuses promotion when the real prompt changed after versioning', async () => {
    await service.recordEvaluation(
      { jobId: '56370', version: '0.1' },
      evaluation,
    );
    const canonicalPath = resolve(
      bundleRoot,
      'prompts',
      'core',
      'obligations.md',
    );
    await writeFile(
      canonicalPath,
      `${await readFile(canonicalPath, 'utf8')}\nExternal change.\n`,
      'utf8',
    );

    await expect(
      service.accept({ jobId: '56370', version: '0.1' }),
    ).rejects.toThrow('Real prompt changed after candidate');
  });

  async function canonicalPrompt(): Promise<string> {
    return readFile(
      resolve(bundleRoot, 'prompts', 'core', 'obligations.md'),
      'utf8',
    );
  }
});
