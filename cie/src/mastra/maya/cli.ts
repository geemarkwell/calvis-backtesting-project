import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CopilotSimulationResponse } from '../../copilot-simulation/copilot-simulation.types';
import { runMaya, type MayaRunResult } from './runner';

interface PreparedMayaInput {
  callout: string;
  oldReplay: CopilotSimulationResponse;
  candidateReplay: CopilotSimulationResponse;
}

function parsePreparedInput(value: unknown): PreparedMayaInput {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('callout' in value) ||
    typeof value.callout !== 'string' ||
    !('oldReplay' in value) ||
    !('candidateReplay' in value)
  ) {
    throw new Error(
      'Prepared Maya input must contain callout, oldReplay, and candidateReplay.',
    );
  }

  return value as unknown as PreparedMayaInput;
}

export async function loadPreparedMayaInput(
  inputPath: string,
): Promise<PreparedMayaInput> {
  const contents = await readFile(resolve(inputPath), 'utf8');
  return parsePreparedInput(JSON.parse(contents) as unknown);
}

export async function runMayaCli(
  args: string[],
  judge: typeof runMaya = runMaya,
): Promise<MayaRunResult> {
  if (args.length !== 1 || !args[0]?.trim()) {
    throw new Error('Usage: yarn maya:judge <prepared-replays.json>');
  }

  const input = await loadPreparedMayaInput(args[0]);
  return judge(input);
}

if (require.main === module) {
  void runMayaCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(
        `${JSON.stringify(
          {
            runId: result.runId,
            artifactDirectory: result.artifactDirectory,
            verdict: result.verdict,
          },
          null,
          2,
        )}\n`,
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Maya judgment failed: ${message}\n`);
      process.exitCode = 1;
    });
}
