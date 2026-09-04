import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { CopilotSimulationResponse } from '../../copilot-simulation/copilot-simulation.types';
import {
  mayaEvidencePacketSchema,
  mayaVerdictSchema,
  type MayaVerdict,
} from './schemas';

const replayReferenceSchema = z
  .object({
    simulationNumber: z.number().int().positive().nullable(),
    logFile: z.string().min(1).nullable(),
  })
  .strict();

const storedVerdictSchema = mayaVerdictSchema.extend({
  confidence: z.number().int().min(0).max(100).nullable(),
});

export const mayaJudgmentRecordSchema = z
  .object({
    version: z.union([z.literal(0), z.literal(1)]),
    runId: z.string().min(1),
    judgedAt: z.iso.datetime({ offset: true }),
    jobId: z.string().regex(/^\d+$/),
    callout: z.string().trim().min(1),
    oldReplay: replayReferenceSchema,
    candidateReplay: replayReferenceSchema,
    verdict: storedVerdictSchema,
  })
  .strict();

export type MayaJudgmentRecord = z.infer<typeof mayaJudgmentRecordSchema>;

export interface CreateMayaJudgmentRecordInput {
  runId: string;
  judgedAt?: string;
  callout: string;
  oldReplay: CopilotSimulationResponse;
  candidateReplay: CopilotSimulationResponse;
  verdict: MayaVerdict;
}

export interface ListMayaJudgmentsInput {
  jobId: string;
  runsRoot?: string;
}

export interface MayaJobJudgmentHistory {
  jobId: string;
  judgments: MayaJudgmentRecord[];
}

export function createMayaJudgmentRecord({
  runId,
  judgedAt = new Date().toISOString(),
  callout,
  oldReplay,
  candidateReplay,
  verdict,
}: CreateMayaJudgmentRecordInput): MayaJudgmentRecord {
  return mayaJudgmentRecordSchema.parse({
    version: 1,
    runId,
    judgedAt,
    jobId: oldReplay.jobId,
    callout,
    oldReplay: replayReference(oldReplay),
    candidateReplay: replayReference(candidateReplay),
    verdict,
  });
}

export async function listMayaJudgments({
  jobId,
  runsRoot = resolve(process.cwd(), 'runs'),
}: ListMayaJudgmentsInput): Promise<MayaJobJudgmentHistory> {
  const normalizedJobId = normalizeJobId(jobId);
  let entries: Dirent[];
  try {
    entries = await readdir(runsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { jobId: normalizedJobId, judgments: [] };
    }
    throw error;
  }

  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('maya-'))
      .map((entry) => loadJudgment(resolve(runsRoot, entry.name), entry.name)),
  );
  const judgments = records
    .filter(
      (record): record is MayaJudgmentRecord =>
        record !== null && record.jobId === normalizedJobId,
    )
    .sort((left, right) => left.judgedAt.localeCompare(right.judgedAt));

  return { jobId: normalizedJobId, judgments };
}

function replayReference(replay: CopilotSimulationResponse) {
  return {
    simulationNumber: Number.isSafeInteger(replay.simulationNumber)
      ? replay.simulationNumber
      : null,
    logFile:
      typeof replay.logFile === 'string' && replay.logFile.trim()
        ? replay.logFile
        : null,
  };
}

function normalizeJobId(jobId: string): string {
  const normalized = jobId.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('jobId must contain digits only.');
  }
  return normalized;
}

async function loadJudgment(
  directory: string,
  runId: string,
): Promise<MayaJudgmentRecord | null> {
  const saved = await readJson(resolve(directory, 'judgment.json'));
  const parsedSaved = mayaJudgmentRecordSchema.safeParse(saved);
  if (parsedSaved.success) {
    return parsedSaved.data;
  }

  return loadLegacyJudgment(directory, runId);
}

async function loadLegacyJudgment(
  directory: string,
  runId: string,
): Promise<MayaJudgmentRecord | null> {
  const evidenceResult = mayaEvidencePacketSchema.safeParse(
    await readJson(resolve(directory, 'evidence-packet.json')),
  );
  const verdict = legacyVerdict(
    await readJson(resolve(directory, 'verdict.json')),
  );
  if (!evidenceResult.success || verdict === null) {
    return null;
  }

  const directoryStats = await stat(directory);
  return mayaJudgmentRecordSchema.parse({
    version: 0,
    runId,
    judgedAt: directoryStats.mtime.toISOString(),
    jobId: evidenceResult.data.jobId,
    callout: evidenceResult.data.callout,
    oldReplay: { simulationNumber: null, logFile: null },
    candidateReplay: { simulationNumber: null, logFile: null },
    verdict,
  });
}

function legacyVerdict(value: unknown): MayaJudgmentRecord['verdict'] | null {
  const current = storedVerdictSchema.safeParse(value);
  if (current.success) {
    return current.data;
  }

  const legacy = mayaVerdictSchema.omit({ confidence: true }).safeParse(value);
  return legacy.success ? { ...legacy.data, confidence: null } : null;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}
