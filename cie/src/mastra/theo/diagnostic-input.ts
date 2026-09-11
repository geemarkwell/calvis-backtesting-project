import { access, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { findBundleRoot } from '../../copilot-simulation/shift-loader';
import { ShiftBundleSourceResolver } from '../../copilot-simulation/shift-bundle-source';
import type { ShiftBundle } from '../../copilot-simulation/copilot-simulation.types';
import { loadSimulationLog } from '../../copilot-simulation/copilot-original.service';
import { instructionFileForTrigger } from '../copilot/turn-builder';
import { compileTraceContext } from '../../trace-context/trace-context.compiler';
import type { CompactTraceContextDto } from '../../trace-context/dto/compile-trace-context.dto';
import {
  normalizeSimulationTrace,
  normalizeTrace,
  selectTraceWindow,
  type NormalizedTraceEntry,
} from './trace-normalizer';

const nonEmptyTextSchema = z.string().trim().min(1);
const jobIdSchema = z
  .union([
    z.string().regex(/^\d+$/, 'Job ID must contain only digits.'),
    z.number().int().nonnegative(),
  ])
  .transform(String);
const turnNumberSchema = z.number().int().positive();
const simulationNumberSchema = z
  .union([
    z.string().regex(/^\d+$/, 'simTarget must contain only digits.'),
    z.number().int().positive(),
  ])
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value > 0, {
    message: 'simTarget must be a positive integer.',
  });
const jobResponseWindowSchema = z
  .object({
    jobId: jobIdSchema,
    startTurn: turnNumberSchema,
    endTurn: turnNumberSchema,
    replaySource: z.literal('production').optional(),
  })
  .strict()
  .refine((window) => window.startTurn <= window.endTurn, {
    path: ['startTurn'],
    message: 'startTurn cannot be greater than endTurn.',
  });
const simulationResponseWindowSchema = z
  .object({
    simTarget: simulationNumberSchema,
    startTurn: turnNumberSchema.optional(),
    endTurn: turnNumberSchema.optional(),
  })
  .strict()
  .refine(
    (window) =>
      window.startTurn === undefined ||
      window.endTurn === undefined ||
      window.startTurn <= window.endTurn,
    {
      path: ['startTurn'],
      message: 'startTurn cannot be greater than endTurn.',
    },
  );

const candidateKindSchema = z.enum([
  'prompt',
  'tool',
  'context',
  'workflow',
  'safety',
  'code',
  'test',
  'unknown',
]);

const diagnosisContextSchema = z
  .object({
    diagnosisRunId: nonEmptyTextSchema.optional(),
    patternId: nonEmptyTextSchema,
    diagnosis: nonEmptyTextSchema,
    likelyCause: nonEmptyTextSchema,
    suggestedFix: nonEmptyTextSchema,
    suggestedCandidateKind: candidateKindSchema.optional(),
    candidateKindRationale: nonEmptyTextSchema.optional(),
    replayableHint: z.boolean().optional(),
    requiresManualValidationHint: z.boolean().optional(),
  })
  .strict();

export const theoRequestSchema = z
  .object({
    whatWentWrong: nonEmptyTextSchema,
    badResponses: z
      .array(z.union([jobResponseWindowSchema, simulationResponseWindowSchema]))
      .min(1, 'At least one bad AI response window is required.'),
    expectedBehavior: nonEmptyTextSchema,
    diagnosisContext: diagnosisContextSchema.optional(),
    useCompactContext: z.boolean().optional(),
  })
  .strict()
  .superRefine((request, context) => {
    const seen = new Set<string>();
    request.badResponses.forEach((window, index) => {
      const key =
        'jobId' in window
          ? `job:${window.jobId}:${window.startTurn}:${window.endTurn}`
          : `simulation:${window.simTarget}:${window.startTurn ?? '*'}:${window.endTurn ?? '*'}`;
      if (seen.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['badResponses', index],
          message: 'Duplicate bad AI response window.',
        });
      }
      seen.add(key);
    });
  });

export type TheoRequest = z.infer<typeof theoRequestSchema>;

export interface DiagnosticResponseWindow {
  jobId: string;
  startTurn: number;
  endTurn: number;
  simTarget?: number;
  trace: NormalizedTraceEntry[];
  compactContext?: CompactTraceContextDto;
}

export interface DiagnosticShiftContext {
  jobId: string;
  shift: Record<string, unknown>;
}

export interface DiagnosticInput {
  whatWentWrong: string;
  expectedBehavior: string;
  badResponses: DiagnosticResponseWindow[];
  shifts: DiagnosticShiftContext[];
  promptFiles: Record<string, string>;
  diagnosisContext?: z.infer<typeof diagnosisContextSchema>;
}

export interface LoadDiagnosticInputOptions {
  request: unknown;
  bundleRoot?: string;
  includeRawTelemetry?: boolean;
}

const RAW_TELEMETRY_CALLOUT =
  /\b(?:battery|connectivity|coordinates?|device|gps|heartbeat|location|movement|offline|online|ping|signal|telemetry)\b/i;

export function extractShiftId(callout: string): string {
  if (!callout.trim()) {
    throw new Error('Callout must name exactly one job or shift ID; found 0.');
  }

  const ids = new Set<string>();
  const shiftReference =
    /\b(?:job|shift)\s*(?:id\s*)?(?:[:=-]\s*)?(?:#\s*)?(\d+)\b/gi;
  for (const match of callout.matchAll(shiftReference)) {
    ids.add(match[1]);
  }

  if (ids.size !== 1) {
    throw new Error(
      `Callout must name exactly one job or shift ID; found ${ids.size}.`,
    );
  }
  return [...ids][0];
}

export function calloutConcernsRawTelemetry(callout: string): boolean {
  return RAW_TELEMETRY_CALLOUT.test(callout);
}

export async function loadShiftBundle(
  bundleRoot: string,
  shiftId: string,
  replaySource?: 'production',
): Promise<ShiftBundle> {
  void bundleRoot;
  const loaded = await new ShiftBundleSourceResolver().load(shiftId, replaySource);
  if (String(loaded.bundle.shift.id) !== shiftId) {
    throw new Error(
      `Production replay bundle shift ID ${String(loaded.bundle.shift.id)} does not match callout shift ID ${shiftId}.`,
    );
  }
  return loaded.bundle;
}

export async function loadDiagnosticInput({
  request: unparsedRequest,
  bundleRoot,
  includeRawTelemetry,
}: LoadDiagnosticInputOptions): Promise<DiagnosticInput> {
  const request = theoRequestSchema.parse(unparsedRequest);
  const resolvedBundleRoot = bundleRoot ?? (await findBundleRoot());
  const concern = `${request.whatWentWrong}\n${request.expectedBehavior}`;
  const includeTelemetry =
    includeRawTelemetry ?? calloutConcernsRawTelemetry(concern);
  const useCompactContext = request.useCompactContext ?? true;
  const bundles = new Map<string, ShiftBundle>();
  const traces = new Map<string, NormalizedTraceEntry[]>();
  const shifts = new Map<string, Record<string, unknown>>();
  const resolvedWindows: Array<{
    jobId: string;
    startTurn: number;
    endTurn: number;
    simTarget?: number;
    traceKey: string;
  }> = [];

  for (const window of request.badResponses) {
    if ('jobId' in window) {
      const traceKey = `job:${window.jobId}`;
      if (!bundles.has(window.jobId)) {
        const bundle = await loadShiftBundle(
          resolvedBundleRoot,
          window.jobId,
          window.replaySource,
        );
        bundles.set(window.jobId, bundle);
        shifts.set(window.jobId, bundle.shift);
        traces.set(
          traceKey,
          normalizeTrace(bundle, { includeRawTelemetry: includeTelemetry }),
        );
      }
      resolvedWindows.push({ ...window, traceKey });
      continue;
    }

    const traceKey = `simulation:${window.simTarget}`;
    const simulation = await loadSimulationLog(
      resolvedBundleRoot,
      window.simTarget,
    );
    if (!/^\d+$/.test(simulation.jobId)) {
      throw new Error(
        `Simulation ${window.simTarget} has a non-numeric job ID: ${simulation.jobId}.`,
      );
    }
    shifts.set(simulation.jobId, simulation.context);
    traces.set(
      traceKey,
      normalizeSimulationTrace(simulation, {
        includeRawTelemetry: includeTelemetry,
      }),
    );
    resolvedWindows.push({
      jobId: simulation.jobId,
      startTurn: window.startTurn ?? simulation.startTurn,
      endTurn: window.endTurn ?? simulation.endTurn,
      simTarget: window.simTarget,
      traceKey,
    });
  }

  const badResponses = resolvedWindows.map(({ traceKey, ...window }) => {
    const selectedTrace = selectTraceWindow(traces.get(traceKey)!, window);
    return {
      ...window,
      trace: selectedTrace,
      compactContext: useCompactContext
        ? compileTraceContext({ trace: selectedTrace, purpose: 'theo' })
        : undefined,
    };
  });
  const promptFiles = await loadPromptFiles(resolve(resolvedBundleRoot, 'prompts'), {
    instructionFiles: selectInstructionFilesForTrace(
      badResponses.flatMap((window) => window.trace),
    ),
  });

  return {
    whatWentWrong: request.whatWentWrong,
    expectedBehavior: request.expectedBehavior,
    badResponses,
    shifts: [...shifts.entries()].map(([jobId, shift]) => ({
      jobId,
      shift,
    })),
    promptFiles,
    diagnosisContext: request.diagnosisContext,
  };
}

export async function loadPromptFiles(
  promptRoot: string,
  options: { instructionFiles?: Iterable<string> } = {},
): Promise<Record<string, string>> {
  const promptFiles: Record<string, string> = {};

  for (const relativeFile of await listFiles(resolve(promptRoot, 'core'))) {
    if (relativeFile === 'MASTER_POLICY.md') {
      continue;
    }
    const stableName = `core/${relativeFile}`;
    promptFiles[stableName] = await readRequiredFile(
      resolve(promptRoot, ...stableName.split('/')),
    );
  }

  const instructionFiles = [...new Set(options.instructionFiles ?? [])].sort();
  for (const stableName of instructionFiles) {
    if (!/^instructions\/[^/]+\.md$/.test(stableName)) {
      continue;
    }
    const contents = await readOptionalFile(resolve(promptRoot, ...stableName.split('/')));
    if (contents !== undefined) {
      promptFiles[stableName] = contents;
    }
  }
  return promptFiles;
}

export function selectInstructionFilesForTrace(
  trace: readonly NormalizedTraceEntry[],
): string[] {
  const instructionFiles = new Set<string>();
  for (const entry of trace) {
    if (entry.type !== 'turn_start') {
      continue;
    }
    const instructionFile = entry.instructionFile ??
      (entry.trigger
        ? `instructions/${instructionFileForTrigger(entry.trigger)}`
        : undefined);
    if (instructionFile) {
      instructionFiles.add(instructionFile);
    }
  }
  return [...instructionFiles].sort();
}

async function listFiles(
  directory: string,
  relativeDirectory = '',
): Promise<string[]> {
  const entries = await readdir(resolve(directory, relativeDirectory), {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relativePath = relativeDirectory
      ? join(relativeDirectory, entry.name)
      : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(directory, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath.split('\\').join('/'));
    }
  }
  return files;
}

async function readRequiredFile(path: string): Promise<string> {
  const contents = await readFile(path, 'utf8');
  if (!contents.trim()) {
    throw new Error(`Prompt file is empty: ${path}`);
  }
  return contents;
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    await access(path);
  } catch {
    return undefined;
  }
  return readRequiredFile(path);
}
