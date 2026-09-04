import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { GetOriginalCopilotDto } from './dto/get-original-copilot.dto';
import { selectTurnWindow } from './episode-builder';
import { eventsInInterval, extractGuardMessage } from './historical-turn-data';
import { buildHistoricalCopilotOutputs } from './output-comparison';
import { findBundleRoot, loadShiftBundle } from './shift-loader';
import type {
  CopilotOriginalResponse,
  CopilotOriginalSourcesResponse,
  CopilotOutputSnapshot,
  CopilotSimulationLog,
} from './copilot-simulation.types';

const EMPTY_COPILOT_OUTPUT: CopilotOutputSnapshot = {
  messages: [],
  actions: [],
  silent: true,
};

const RECORDED_MODEL_CONFIGURATION = {
  model: 'recorded-shift-trace',
  maxRetries: 0,
  maxSteps: 0,
};

@Injectable()
export class CopilotOriginalService {
  async getOriginal(
    input: GetOriginalCopilotDto,
  ): Promise<CopilotOriginalResponse> {
    const bundleRoot = await findBundleRoot();
    if (normalizeSource(input.source) === 'simulation') {
      return this.getSimulationOriginal(bundleRoot, input);
    }

    const { jobId, bundle } = await loadShiftBundle(bundleRoot, input.jobId);
    const episode = selectTurnWindow(
      bundle,
      optionalTurn(input.startTurn, 'startTurn'),
      optionalTurn(input.endTurn, 'endTurn'),
    );
    const outputs = buildHistoricalCopilotOutputs(bundle);
    let previousBoundary = episode.historyBoundary;

    const turns = episode.selectedTurns.map((turn) => {
      const shiftEvents = eventsInInterval(
        bundle.events,
        previousBoundary,
        turn.ts,
      );
      const guardMessages = shiftEvents
        .filter((event) => event.type === 'guard_message')
        .map(extractGuardMessage)
        .filter((message): message is string => Boolean(message));
      const originalOutput = outputs.get(turn.turn) ?? EMPTY_COPILOT_OUTPUT;
      previousBoundary = turn.ts;

      return {
        turn: turn.turn,
        trigger: turn.trigger,
        timestamp: turn.ts,
        shiftEvents,
        guardMessages,
        guardReplies: guardMessages.map((message) => ({
          reply: message,
          source: 'historical' as const,
          historicalReply: message,
        })),
        copilotMessages: originalOutput.messages,
        modelText: null,
        finishReason: 'recorded',
        toolCalls: originalOutput.actions,
        silent: originalOutput.silent,
        skipped: false,
        candidateCopilotOutput: originalOutput,
        historicalCopilotOutput: originalOutput,
        diverged: false,
        divergedThisTurn: false,
      };
    });

    return {
      jobId,
      status: 'completed',
      startTurn: episode.selectedTurns[0].turn,
      endTurn: episode.selectedTurns[episode.selectedTurns.length - 1].turn,
      replayMode: 'original',
      callNiko: false,
      modelConfiguration: RECORDED_MODEL_CONFIGURATION,
      turns,
    };
  }

  async listSources(
    input: GetOriginalCopilotDto,
  ): Promise<CopilotOriginalSourcesResponse> {
    const bundleRoot = await findBundleRoot();
    const { jobId, bundle } = await loadShiftBundle(bundleRoot, input.jobId);
    const window = selectTurnWindow(
      bundle,
      optionalTurn(input.startTurn, 'startTurn'),
      optionalTurn(input.endTurn, 'endTurn'),
    );
    const startTurn = window.selectedTurns[0].turn;
    const endTurn = window.selectedTurns[window.selectedTurns.length - 1].turn;
    const logs = await listSimulationLogs(bundleRoot);
    const compatibleLogs = logs
      .filter(
        (log) =>
          log.jobId === jobId &&
          log.startTurn <= startTurn &&
          log.endTurn >= endTurn &&
          includesTurnRange(log, startTurn, endTurn),
      )
      .sort((left, right) => right.simulationNumber - left.simulationNumber);

    return {
      jobId,
      startTurn,
      endTurn,
      sources: [
        {
          id: 'shift',
          source: 'shift',
          label: 'Recorded shift',
        },
        ...compatibleLogs.map((log) => ({
          id: `simulation:${log.simulationNumber}`,
          source: 'simulation' as const,
          label: `Agent v${log.simulationNumber} · ${log.replayMode} · ${log.modelConfiguration.model}`,
          simulationNumber: log.simulationNumber,
          createdAt: log.createdAt,
          replayMode: log.replayMode,
          model: log.modelConfiguration.model,
        })),
      ],
    };
  }

  private async getSimulationOriginal(
    bundleRoot: string,
    input: GetOriginalCopilotDto,
  ): Promise<CopilotOriginalResponse> {
    const { jobId, bundle } = await loadShiftBundle(bundleRoot, input.jobId);
    const simulationNumber = normalizeSimulationNumber(input.simulationNumber);
    const log = await loadSimulationLog(bundleRoot, simulationNumber);
    if (log.jobId !== jobId) {
      throw new NotFoundException(
        `Agent v${simulationNumber} is not available for job ${jobId}.`,
      );
    }

    const episode = selectTurnWindow(
      bundle,
      optionalTurn(input.startTurn, 'startTurn') ?? log.startTurn,
      optionalTurn(input.endTurn, 'endTurn') ?? log.endTurn,
    );
    const startTurn = episode.selectedTurns[0].turn;
    const endTurn =
      episode.selectedTurns[episode.selectedTurns.length - 1].turn;
    if (!includesTurnRange(log, startTurn, endTurn)) {
      throw new BadRequestException(
        `Agent v${simulationNumber} does not contain turns ${startTurn} through ${endTurn}.`,
      );
    }

    const loggedTurns = new Map(log.turns.map((turn) => [turn.turn, turn]));
    const historicalOutputs = buildHistoricalCopilotOutputs(bundle);
    let previousBoundary = episode.historyBoundary;
    const turns = episode.selectedTurns.map((turn) => {
      const loggedTurn = loggedTurns.get(turn.turn)!;
      const shiftEvents = eventsInInterval(
        bundle.events,
        previousBoundary,
        turn.ts,
      );
      const guardMessages = shiftEvents
        .filter((event) => event.type === 'guard_message')
        .map(extractGuardMessage)
        .filter((message): message is string => Boolean(message));
      const selectedOutput: CopilotOutputSnapshot = {
        messages: loggedTurn.newCopilot.messages,
        actions: loggedTurn.newCopilot.actions,
        silent: loggedTurn.newCopilot.silent,
      };
      const historicalOutput =
        historicalOutputs.get(turn.turn) ?? EMPTY_COPILOT_OUTPUT;
      previousBoundary = turn.ts;
      return {
        turn: turn.turn,
        trigger: turn.trigger,
        timestamp: turn.ts,
        shiftEvents,
        guardMessages,
        guardReplies: guardMessages.map((message) => ({
          reply: message,
          source: 'historical' as const,
          historicalReply: message,
        })),
        copilotMessages: selectedOutput.messages,
        modelText: loggedTurn.newCopilot.modelText,
        finishReason: loggedTurn.newCopilot.stopReason,
        toolCalls: selectedOutput.actions,
        silent: selectedOutput.silent,
        skipped: loggedTurn.newCopilot.skipped,
        candidateCopilotOutput: selectedOutput,
        historicalCopilotOutput: historicalOutput,
        diverged: false,
        divergedThisTurn: false,
      };
    });

    return {
      jobId,
      status: 'completed',
      startTurn,
      endTurn,
      replayMode: 'original',
      callNiko: false,
      modelConfiguration: log.modelConfiguration,
      turns,
    };
  }
}

async function listSimulationLogs(
  bundleRoot: string,
): Promise<CopilotSimulationLog[]> {
  const databaseDirectory = resolve(bundleRoot, 'cie', 'database');
  let fileNames: string[];
  try {
    fileNames = await readdir(databaseDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const logs = await Promise.all(
    fileNames
      .filter((fileName) => /^simulate-\d+\.json$/.test(fileName))
      .map(async (fileName) => {
        try {
          const value: unknown = JSON.parse(
            await readFile(resolve(databaseDirectory, fileName), 'utf8'),
          );
          return isSimulationLog(value) ? value : null;
        } catch {
          return null;
        }
      }),
  );
  return logs.filter((log): log is CopilotSimulationLog => log !== null);
}

export async function loadSimulationLog(
  bundleRoot: string,
  simulationNumber: number,
): Promise<CopilotSimulationLog> {
  const filePath = resolve(
    bundleRoot,
    'cie',
    'database',
    `simulate-${simulationNumber}.json`,
  );
  let contents: string;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new NotFoundException(`Agent v${simulationNumber} was not found.`);
    }
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new BadRequestException(
      `Agent v${simulationNumber} contains invalid JSON.`,
    );
  }
  if (!isSimulationLog(value) || value.simulationNumber !== simulationNumber) {
    throw new BadRequestException(
      `Agent v${simulationNumber} does not match the expected format.`,
    );
  }
  return value;
}

function includesTurnRange(
  log: CopilotSimulationLog,
  startTurn: number,
  endTurn: number,
): boolean {
  const turns = new Set(log.turns.map((turn) => turn.turn));
  for (let turn = startTurn; turn <= endTurn; turn += 1) {
    if (!turns.has(turn)) {
      return false;
    }
  }
  return true;
}

function normalizeSource(
  source: GetOriginalCopilotDto['source'],
): 'shift' | 'simulation' {
  if (source === undefined || source === 'shift') {
    return 'shift';
  }
  if (source === 'simulation') {
    return source;
  }
  throw new BadRequestException('source must be either shift or simulation.');
}

function normalizeSimulationNumber(value: unknown): number {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new BadRequestException(
      'simulationNumber must be a positive integer.',
    );
  }
  return number;
}

function isSimulationLog(value: unknown): value is CopilotSimulationLog {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Number.isSafeInteger(value.simulationNumber) &&
    typeof value.createdAt === 'string' &&
    typeof value.jobId === 'string' &&
    Number.isSafeInteger(value.startTurn) &&
    Number.isSafeInteger(value.endTurn) &&
    (value.replayMode === 'original' || value.replayMode === 'candidate') &&
    isRecord(value.modelConfiguration) &&
    typeof value.modelConfiguration.model === 'string' &&
    Number.isSafeInteger(value.modelConfiguration.maxRetries) &&
    Number.isSafeInteger(value.modelConfiguration.maxSteps) &&
    Array.isArray(value.turns) &&
    value.turns.every(isSimulationLogTurn)
  );
}

function isSimulationLogTurn(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.turn) &&
    typeof value.timestamp === 'string' &&
    typeof value.trigger === 'string' &&
    Array.isArray(value.guardMessages) &&
    value.guardMessages.every(isGuardReply) &&
    Array.isArray(value.events) &&
    isOutputSnapshot(value.originalCopilot) &&
    isRecord(value.newCopilot) &&
    isOutputSnapshot(value.newCopilot) &&
    (typeof value.newCopilot.modelText === 'string' ||
      value.newCopilot.modelText === null) &&
    typeof value.newCopilot.stopReason === 'string' &&
    typeof value.newCopilot.skipped === 'boolean'
  );
}

function isGuardReply(value: unknown): boolean {
  return (
    isRecord(value) &&
    (typeof value.reply === 'string' || value.reply === null) &&
    (value.source === 'historical' || value.source === 'simulated') &&
    typeof value.historicalReply === 'string'
  );
}

function isOutputSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.messages) &&
    value.messages.every((message) => typeof message === 'string') &&
    Array.isArray(value.actions) &&
    value.actions.every(
      (action) =>
        isRecord(action) &&
        typeof action.tool === 'string' &&
        isRecord(action.input),
    ) &&
    typeof value.silent === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalTurn(
  value: string | number | undefined,
  field: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized =
    typeof value === 'number'
      ? value
      : /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new BadRequestException(`${field} must be a positive integer.`);
  }
  return normalized;
}
