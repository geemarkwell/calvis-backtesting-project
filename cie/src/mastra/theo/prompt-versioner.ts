import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assembleCopilotSystemPrompt } from '../copilot/prompt-loader';
import type { TheoDiagnosis } from './schemas';

const VERSION_DIRECTORY_PATTERN = /^job-(\d+)-0\.([1-9]\d*)$/;
const MUTABLE_PROMPT_FILE_PATTERN = /^(?:core|instructions)\/[^/]+\.md$/;

export interface CreateCandidatePromptVersionInput {
  promptRoot: string;
  versionsRoot: string;
  jobId: string;
  runId: string;
  edit: TheoDiagnosis['proposed_edit'];
}

export interface CandidatePromptVersion {
  jobId: string;
  version: string;
  promptRoot: string;
  changedFile: string;
  diff: string;
}

export async function createCandidatePromptVersion({
  promptRoot,
  versionsRoot,
  jobId,
  runId,
  edit,
}: CreateCandidatePromptVersionInput): Promise<CandidatePromptVersion> {
  if (!/^\d+$/.test(jobId)) {
    throw new Error(
      `Candidate prompt job ID must contain only digits: ${jobId}.`,
    );
  }
  if (!MUTABLE_PROMPT_FILE_PATTERN.test(edit.file)) {
    throw new Error(`Candidate prompt file is not mutable: ${edit.file}.`);
  }

  const { version, versionDirectory } = await reserveVersionDirectory(
    versionsRoot,
    jobId,
  );

  try {
    await Promise.all([
      cp(resolve(promptRoot, 'core'), resolve(versionDirectory, 'core'), {
        recursive: true,
        force: false,
        errorOnExist: true,
      }),
      cp(
        resolve(promptRoot, 'instructions'),
        resolve(versionDirectory, 'instructions'),
        {
          recursive: true,
          force: false,
          errorOnExist: true,
        },
      ),
    ]);

    const candidateFile = resolve(versionDirectory, ...edit.file.split('/'));
    const originalContents = await readFile(candidateFile, 'utf8');
    const occurrences = countOccurrences(originalContents, edit.old_text);
    if (occurrences !== 1) {
      throw new Error(
        `Candidate prompt old_text must occur exactly once in ${edit.file}; found ${occurrences}.`,
      );
    }

    const replacementIndex = originalContents.indexOf(edit.old_text);
    const candidateContents = `${originalContents.slice(0, replacementIndex)}${edit.new_text}${originalContents.slice(replacementIndex + edit.old_text.length)}`;
    if (!candidateContents.trim()) {
      throw new Error(`Candidate prompt replacement would empty ${edit.file}.`);
    }
    await writeFile(candidateFile, candidateContents, 'utf8');
    await assembleCopilotSystemPrompt({
      promptRoot: versionDirectory,
      shift: { id: 'candidate-validation' },
    });

    const diff = buildPromptDiff(jobId, version, edit);
    const createdAt = new Date().toISOString();
    await Promise.all([
      writeFile(
        resolve(versionDirectory, 'version.json'),
        `${JSON.stringify(
          {
            jobId,
            version,
            createdAt,
            sourceVersion: 'original',
            runId,
            changedFile: edit.file,
            oldText: edit.old_text,
            newText: edit.new_text,
            intendedEffect: edit.intended_effect,
            sourceFileHash: hashContents(originalContents),
            candidateFileHash: hashContents(candidateContents),
          },
          null,
          2,
        )}\n`,
        'utf8',
      ),
      writeFile(
        resolve(versionDirectory, 'decision.json'),
        `${JSON.stringify(
          {
            jobId,
            version,
            status: 'pending',
            createdAt,
            decidedAt: null,
            evaluation: null,
          },
          null,
          2,
        )}\n`,
        'utf8',
      ),
      writeFile(resolve(versionDirectory, 'prompt.diff'), diff, 'utf8'),
    ]);

    return {
      jobId,
      version,
      promptRoot: versionDirectory,
      changedFile: edit.file,
      diff,
    };
  } catch (error) {
    await rm(versionDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function reserveVersionDirectory(
  versionsRoot: string,
  jobId: string,
): Promise<{ version: string; versionDirectory: string }> {
  await mkdir(versionsRoot, { recursive: true });
  const entries = await readdir(versionsRoot, { withFileTypes: true });
  let nextMinor =
    entries.reduce((highest, entry) => {
      if (!entry.isDirectory()) {
        return highest;
      }
      const match = VERSION_DIRECTORY_PATTERN.exec(entry.name);
      return match?.[1] === jobId
        ? Math.max(highest, Number(match[2]))
        : highest;
    }, 0) + 1;

  while (true) {
    const version = `0.${nextMinor}`;
    const versionDirectory = resolve(versionsRoot, `job-${jobId}-${version}`);
    try {
      await mkdir(versionDirectory);
      return { version, versionDirectory };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      nextMinor += 1;
    }
  }
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

function buildPromptDiff(
  jobId: string,
  version: string,
  edit: TheoDiagnosis['proposed_edit'],
): string {
  const removed = edit.old_text
    .split('\n')
    .map((line) => `-${line}`)
    .join('\n');
  const added = edit.new_text
    .split('\n')
    .map((line) => `+${line}`)
    .join('\n');

  return `--- prompts/${edit.file}\n+++ prompt-versions/job-${jobId}-${version}/${edit.file}\n@@\n${removed}\n${added}\n`;
}
