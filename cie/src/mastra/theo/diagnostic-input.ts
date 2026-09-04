import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import {
  findBundleRoot,
  loadShiftBundle as loadSimulationShiftBundle,
} from '../../copilot-simulation/shift-loader';
import type { ShiftBundle } from '../../copilot-simulation/copilot-simulation.types';
import { loadSimulationLog } from '../../copilot-simulation/copilot-original.service';
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

export const theoRequestSchema = z
  .object({
    whatWentWrong: nonEmptyTextSchema,
    badResponses: z
      .array(z.union([jobResponseWindowSchema, simulationResponseWindowSchema]))
      .min(1, 'At least one bad AI response window is required.'),
    expectedBehavior: nonEmptyTextSchema,
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
): Promise<ShiftBundle> {
  const loaded = await loadSimulationShiftBundle(bundleRoot, shiftId);
  if (String(loaded.bundle.shift.id) !== shiftId) {
    throw new Error(
      `Shift fixture ID ${String(loaded.bundle.shift.id)} does not match callout shift ID ${shiftId}.`,
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
        const bundle = await loadShiftBundle(resolvedBundleRoot, window.jobId);
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

  const promptFiles = await loadPromptFiles(
    resolve(resolvedBundleRoot, 'prompts'),
  );

  return {
    whatWentWrong: request.whatWentWrong,
    expectedBehavior: request.expectedBehavior,
    badResponses: resolvedWindows.map(({ traceKey, ...window }) => {
      return {
        ...window,
        trace: selectTraceWindow(traces.get(traceKey)!, window),
      };
    }),
    shifts: [...shifts.entries()].map(([jobId, shift]) => ({
      jobId,
      shift,
    })),
    promptFiles,
  };
}

export async function loadPromptFiles(
  promptRoot: string,
): Promise<Record<string, string>> {
  const promptFiles: Record<string, string> = {
    'PROMPTS.md': await readRequiredFile(resolve(promptRoot, 'PROMPTS.md')),
  };

  for (const directory of ['core', 'instructions']) {
    const files = await listFiles(resolve(promptRoot, directory));
    for (const relativeFile of files) {
      const stableName = `${directory}/${relativeFile}`;
      promptFiles[stableName] = await readRequiredFile(
        resolve(promptRoot, ...stableName.split('/')),
      );
    }
  }
  return promptFiles;
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
