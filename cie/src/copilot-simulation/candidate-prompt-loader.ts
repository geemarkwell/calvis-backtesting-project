import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { UpdatedPrompt } from './copilot-simulation.types';

const JOB_ID_PATTERN = /^\d+$/;
const PROMPT_VERSION_PATTERN = /^0\.[1-9]\d*$/;
const MUTABLE_PROMPT_FILE_PATTERN = /^(?:core|instructions)\/[^/]+\.md$/;

interface CandidatePromptManifest {
  jobId: string;
  version: string;
  changedFile: string;
  oldText: string;
  newText: string;
  intendedEffect: string;
  sourceFileHash: string;
  candidateFileHash: string;
}

export interface LoadCandidatePromptInput {
  versionsRoot: string;
  jobId: string;
  version: string;
}

export interface LoadedCandidatePrompt {
  promptRoot: string;
  updatedPrompt: UpdatedPrompt;
  sourceFileHash: string;
  candidateFileHash: string;
}

export async function loadCandidatePrompt({
  versionsRoot,
  jobId,
  version,
}: LoadCandidatePromptInput): Promise<LoadedCandidatePrompt> {
  validateCandidateCoordinates(jobId, version);

  const promptRoot = resolve(versionsRoot, `job-${jobId}-${version}`);
  const manifestPath = resolve(promptRoot, 'version.json');
  let manifest: CandidatePromptManifest;

  try {
    const contents = await readFile(manifestPath, 'utf8');
    manifest = parseManifest(JSON.parse(contents) as unknown, manifestPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Candidate prompt version not found for job ${jobId}: ${version}.`,
      );
    }
    if (error instanceof SyntaxError) {
      throw new Error(
        `Candidate prompt manifest is invalid JSON: ${manifestPath}.`,
      );
    }
    throw error;
  }

  if (manifest.jobId !== jobId || manifest.version !== version) {
    throw new Error(
      `Candidate prompt manifest does not match job ${jobId} version ${version}.`,
    );
  }

  const changedPrompt = await readFile(
    resolve(promptRoot, ...manifest.changedFile.split('/')),
    'utf8',
  );
  if (!changedPrompt.includes(manifest.newText)) {
    throw new Error(
      `Candidate prompt file does not contain recorded replacement: ${manifest.changedFile}.`,
    );
  }
  if (hashContents(changedPrompt) !== manifest.candidateFileHash) {
    throw new Error(
      `Candidate prompt file hash does not match its manifest: ${manifest.changedFile}.`,
    );
  }

  return {
    promptRoot,
    updatedPrompt: {
      jobId,
      version,
      file: manifest.changedFile,
      oldText: manifest.oldText,
      newText: manifest.newText,
      intendedEffect: manifest.intendedEffect,
    },
    sourceFileHash: manifest.sourceFileHash,
    candidateFileHash: manifest.candidateFileHash,
  };
}

function validateCandidateCoordinates(jobId: string, version: string): void {
  if (!JOB_ID_PATTERN.test(jobId)) {
    throw new Error(
      `Candidate prompt job ID must contain only digits: ${jobId}.`,
    );
  }
  if (!PROMPT_VERSION_PATTERN.test(version)) {
    throw new Error(
      `Candidate prompt version must use 0.<positive integer>: ${version}.`,
    );
  }
}

function parseManifest(
  value: unknown,
  manifestPath: string,
): CandidatePromptManifest {
  if (!isRecord(value)) {
    throw new Error(`Candidate prompt manifest is invalid: ${manifestPath}.`);
  }

  const manifest = value as Partial<CandidatePromptManifest>;
  if (
    typeof manifest.jobId !== 'string' ||
    typeof manifest.version !== 'string' ||
    typeof manifest.changedFile !== 'string' ||
    !MUTABLE_PROMPT_FILE_PATTERN.test(manifest.changedFile) ||
    typeof manifest.oldText !== 'string' ||
    !manifest.oldText ||
    typeof manifest.newText !== 'string' ||
    !manifest.newText ||
    typeof manifest.intendedEffect !== 'string' ||
    !manifest.intendedEffect ||
    typeof manifest.sourceFileHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.sourceFileHash) ||
    typeof manifest.candidateFileHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.candidateFileHash)
  ) {
    throw new Error(`Candidate prompt manifest is invalid: ${manifestPath}.`);
  }

  return manifest as CandidatePromptManifest;  
}

function hashContents(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
