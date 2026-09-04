import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  CopilotSimulationLog,
  CopilotSimulationResult,
  ShiftBundle,
} from './copilot-simulation.types';

const SIMULATION_FILE_PATTERN = /^simulate-(\d+)\.json$/;

export interface WriteSimulationLogInput {
  bundleRoot: string;
  bundle: ShiftBundle;
  simulation: CopilotSimulationResult;
}

export interface SimulationLogReference {
  simulationNumber: number;
  logFile: string;
}

export async function writeSimulationLog({
  bundleRoot,
  bundle,
  simulation,
}: WriteSimulationLogInput): Promise<SimulationLogReference> {
  const databaseDirectory = resolve(bundleRoot, 'cie', 'database');
  await mkdir(databaseDirectory, { recursive: true });

  const existingFiles = await readdir(databaseDirectory);
  let simulationNumber = nextSimulationNumber(existingFiles);

  while (true) {
    const fileName = `simulate-${simulationNumber}.json`;
    const filePath = resolve(databaseDirectory, fileName);
    const log = buildSimulationLog(simulationNumber, bundle, simulation);

    try {
      await writeFile(filePath, `${JSON.stringify(log, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      return {
        simulationNumber,
        logFile: `database/${fileName}`,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      simulationNumber += 1;
    }
  }
}

export function nextSimulationNumber(fileNames: string[]): number {
  const highestNumber = fileNames.reduce((highest, fileName) => {
    const match = SIMULATION_FILE_PATTERN.exec(fileName);
    if (!match) {
      return highest;
    }
    const number = Number(match[1]);
    return Number.isSafeInteger(number) ? Math.max(highest, number) : highest;
  }, 0);

  return highestNumber + 1;
}

function buildSimulationLog(
  simulationNumber: number,
  bundle: ShiftBundle,
  simulation: CopilotSimulationResult,
): CopilotSimulationLog {
  return {
    simulationNumber,
    createdAt: new Date().toISOString(),
    jobId: simulation.jobId,
    startTurn: simulation.startTurn,
    endTurn: simulation.endTurn,
    replayMode: simulation.replayMode,
    callNiko: simulation.callNiko,
    modelConfiguration: simulation.modelConfiguration,
    ...(simulation.updatedPrompt
      ? { updatedPrompt: simulation.updatedPrompt }
      : {}),
    context: bundle.shift,
    turns: simulation.turns.map((turn) => ({
      turn: turn.turn,
      timestamp: turn.timestamp,
      trigger: turn.trigger,
      guardMessages: turn.guardReplies,
      events: turn.shiftEvents,
      originalCopilot: turn.historicalCopilotOutput,
      newCopilot: {
        ...turn.candidateCopilotOutput,
        modelText: turn.modelText,
        stopReason: turn.finishReason,
        skipped: turn.skipped,
      },
    })),
  };
}
