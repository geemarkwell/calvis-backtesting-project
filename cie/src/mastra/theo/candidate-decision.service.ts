import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  cp,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { loadCandidatePrompt } from '../../copilot-simulation/candidate-prompt-loader';
import type { UpdatedPrompt } from '../../copilot-simulation/copilot-simulation.types';
import { findBundleRoot } from '../../copilot-simulation/shift-loader';
import { assembleCopilotSystemPrompt } from '../copilot/prompt-loader';

export type CandidateDecisionStatus = 'pending' | 'accepted' | 'rejected';

export interface CandidateEvaluation {
  runId: string;
  judgedAt: string;
  fixed: boolean;
  verdict: 'yes' | 'no';
  confidence: number | null;
  summary: string;
}

export interface CandidateDecision {
  jobId: string;
  version: string;
  status: CandidateDecisionStatus;
  createdAt: string;
  decidedAt: string | null;
  evaluation: CandidateEvaluation | null;
}

export interface CandidateDecisionResult {
  decision: CandidateDecision;
  updatedPrompt: UpdatedPrompt;
}

export interface CandidateCoordinates {
  jobId: string | number;
  version: string;
}

@Injectable()
export class CandidateDecisionService {
  async get(input: CandidateCoordinates): Promise<CandidateDecisionResult> {
    const candidate = await this.loadCandidate(input);
    return {
      decision: await readDecision(
        candidate.promptRoot,
        candidate.updatedPrompt.jobId,
        candidate.updatedPrompt.version,
      ),
      updatedPrompt: candidate.updatedPrompt,
    };
  }

  async recordEvaluation(
    input: CandidateCoordinates,
    evaluation: CandidateEvaluation,
  ): Promise<CandidateDecisionResult> {
    const candidate = await this.loadCandidate(input);
    const decision = await withCandidateLock(candidate.promptRoot, async () => {
      const current = await readDecision(
        candidate.promptRoot,
        candidate.updatedPrompt.jobId,
        candidate.updatedPrompt.version,
      );
      if (current.status !== 'pending') {
        throw new ConflictException(
          `Candidate job ${current.jobId} version ${current.version} is already ${current.status}.`,
        );
      }
      const updated = { ...current, evaluation };
      await writeDecision(candidate.promptRoot, updated);
      return updated;
    });
    return { decision, updatedPrompt: candidate.updatedPrompt };
  }

  async accept(input: CandidateCoordinates): Promise<CandidateDecisionResult> {
    const candidate = await this.loadCandidate(input);
    const decision = await withCandidateLock(candidate.promptRoot, async () => {
      const current = await readDecision(
        candidate.promptRoot,
        candidate.updatedPrompt.jobId,
        candidate.updatedPrompt.version,
      );
      if (current.status === 'accepted') {
        return current;
      }
      if (current.status === 'rejected') {
        throw new ConflictException(
          `Candidate job ${current.jobId} version ${current.version} was rejected and cannot be accepted.`,
        );
      }
      if (!current.evaluation) {
        throw new ConflictException(
          `Candidate job ${current.jobId} version ${current.version} has not been evaluated by Maya.`,
        );
      }

      const bundleRoot = await findBundleRoot();
      const canonicalPromptRoot = resolve(bundleRoot, 'prompts');
      const canonicalFile = resolve(
        canonicalPromptRoot,
        ...candidate.updatedPrompt.file.split('/'),
      );
      const canonicalContents = await readFile(canonicalFile, 'utf8');
      const canonicalHash = hashContents(canonicalContents);

      if (canonicalHash !== candidate.candidateFileHash) {
        if (canonicalHash !== candidate.sourceFileHash) {
          throw new ConflictException(
            `Real prompt changed after candidate job ${current.jobId} version ${current.version} was created.`,
          );
        }

        const occurrences = countOccurrences(
          canonicalContents,
          candidate.updatedPrompt.oldText,
        );
        if (occurrences !== 1) {
          throw new ConflictException(
            `Real prompt oldText must occur exactly once; found ${occurrences}.`,
          );
        }
        const promotedContents = replaceOnce(
          canonicalContents,
          candidate.updatedPrompt.oldText,
          candidate.updatedPrompt.newText,
        );
        if (hashContents(promotedContents) !== candidate.candidateFileHash) {
          throw new ConflictException(
            'Candidate replacement no longer matches its validated prompt copy.',
          );
        }

        await validatePromotion(
          canonicalPromptRoot,
          candidate.updatedPrompt.file,
          promotedContents,
        );
        const latestCanonicalContents = await readFile(canonicalFile, 'utf8');
        if (
          hashContents(latestCanonicalContents) !== candidate.sourceFileHash
        ) {
          throw new ConflictException(
            'Real prompt changed while candidate promotion was being validated.',
          );
        }
        await writeFileAtomically(canonicalFile, promotedContents);
      }

      const accepted: CandidateDecision = {
        ...current,
        status: 'accepted',
        decidedAt: new Date().toISOString(),
      };
      await writeDecision(candidate.promptRoot, accepted);
      return accepted;
    });
    return { decision, updatedPrompt: candidate.updatedPrompt };
  }

  async reject(input: CandidateCoordinates): Promise<CandidateDecisionResult> {
    const candidate = await this.loadCandidate(input);
    const decision = await withCandidateLock(candidate.promptRoot, async () => {
      const current = await readDecision(
        candidate.promptRoot,
        candidate.updatedPrompt.jobId,
        candidate.updatedPrompt.version,
      );
      if (current.status === 'rejected') {
        return current;
      }
      if (current.status === 'accepted') {
        throw new ConflictException(
          `Candidate job ${current.jobId} version ${current.version} was accepted and cannot be rejected.`,
        );
      }

      const rejected: CandidateDecision = {
        ...current,
        status: 'rejected',
        decidedAt: new Date().toISOString(),
      };
      await writeDecision(candidate.promptRoot, rejected);
      return rejected;
    });
    return { decision, updatedPrompt: candidate.updatedPrompt };
  }

  private async loadCandidate(input: CandidateCoordinates) {
    const jobId = normalizeJobId(input.jobId);
    try {
      return await loadCandidatePrompt({
        versionsRoot: resolve(await findBundleRoot(), 'cie', 'prompt-versions'),
        jobId,
        version: input.version,
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new NotFoundException(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

function normalizeJobId(value: string | number): string {
  const jobId = String(value);
  if (!/^\d+$/.test(jobId)) {
    throw new NotFoundException(`Invalid candidate job ID: ${jobId}.`);
  }
  return jobId;
}

async function readDecision(
  promptRoot: string,
  jobId: string,
  version: string,
): Promise<CandidateDecision> {
  const decisionPath = resolve(promptRoot, 'decision.json');
  let value: unknown;
  try {
    value = JSON.parse(await readFile(decisionPath, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundException(`Candidate decision file not found.`);
    }
    throw error;
  }
  if (!isCandidateDecision(value)) {
    throw new Error(`Candidate decision file is invalid: ${decisionPath}.`);
  }
  if (value.jobId !== jobId || value.version !== version) {
    throw new Error(
      `Candidate decision does not match job ${jobId} version ${version}.`,
    );
  }
  return value;
}

function isCandidateDecision(value: unknown): value is CandidateDecision {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.jobId === 'string' &&
    typeof value.version === 'string' &&
    (value.status === 'pending' ||
      value.status === 'accepted' ||
      value.status === 'rejected') &&
    typeof value.createdAt === 'string' &&
    (value.decidedAt === null || typeof value.decidedAt === 'string') &&
    (value.evaluation === null || isCandidateEvaluation(value.evaluation))
  );
}

function isCandidateEvaluation(value: unknown): value is CandidateEvaluation {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.runId === 'string' &&
    typeof value.judgedAt === 'string' &&
    typeof value.fixed === 'boolean' &&
    (value.verdict === 'yes' || value.verdict === 'no') &&
    (value.confidence === null || typeof value.confidence === 'number') &&
    typeof value.summary === 'string'
  );
}

async function writeDecision(
  promptRoot: string,
  decision: CandidateDecision,
): Promise<void> {
  await writeJsonAtomically(resolve(promptRoot, 'decision.json'), decision);
}

async function withCandidateLock<Result>(
  promptRoot: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  const lockPath = resolve(promptRoot, '.decision.lock');
  try {
    await writeFile(lockPath, `${process.pid}\n`, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ConflictException('Candidate decision is already in progress.');
    }
    throw error;
  }

  try {
    return await operation();
  } finally {
    await rm(lockPath, { force: true });
  }
}

async function validatePromotion(
  canonicalPromptRoot: string,
  changedFile: string,
  promotedContents: string,
): Promise<void> {
  if (!promotedContents.trim()) {
    throw new ConflictException(
      'Candidate replacement would empty real prompt.',
    );
  }
  const temporaryRoot = await mkdtemp(
    resolve(tmpdir(), 'calvis-prompt-promotion-'),
  );
  try {
    await Promise.all([
      cp(resolve(canonicalPromptRoot, 'core'), resolve(temporaryRoot, 'core'), {
        recursive: true,
      }),
      cp(
        resolve(canonicalPromptRoot, 'instructions'),
        resolve(temporaryRoot, 'instructions'),
        { recursive: true },
      ),
    ]);
    await writeFile(
      resolve(temporaryRoot, ...changedFile.split('/')),
      promotedContents,
      'utf8',
    );
    await assembleCopilotSystemPrompt({
      promptRoot: temporaryRoot,
      shift: { id: 'accepted-candidate-validation' },
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function writeFileAtomically(
  targetPath: string,
  contents: string,
): Promise<void> {
  const temporaryPath = resolve(
    dirname(targetPath),
    `.${basename(targetPath)}.${randomUUID()}.tmp`,
  );
  const targetStats = await stat(targetPath);
  try {
    await writeFile(temporaryPath, contents, {
      encoding: 'utf8',
      flag: 'wx',
      mode: targetStats.mode,
    });
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function writeJsonAtomically(
  targetPath: string,
  value: unknown,
): Promise<void> {
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await rename(temporaryPath, targetPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function replaceOnce(
  contents: string,
  oldText: string,
  newText: string,
): string {
  const index = contents.indexOf(oldText);
  return `${contents.slice(0, index)}${newText}${contents.slice(index + oldText.length)}`;
}

function countOccurrences(contents: string, search: string): number {
  let count = 0;
  let offset = 0;
  while (offset <= contents.length - search.length) {
    const index = contents.indexOf(search, offset);
    if (index < 0) {
      break;
    }
    count += 1;
    offset = index + 1;
  }
  return count;
}

function hashContents(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
