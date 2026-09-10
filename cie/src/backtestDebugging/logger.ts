import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface BacktestDebuggingRun {
  runId: string;
  artifactDirectory: string;
  writeStage: (fileName: string, value: unknown) => Promise<void>;
}

export type BacktestDebuggingSink = Pick<
  BacktestDebuggingRun,
  'runId' | 'artifactDirectory' | 'writeStage'
>;

export async function createBacktestDebuggingRun(
  root = resolve(process.cwd(), 'runs', 'backtestDebugging'),
): Promise<BacktestDebuggingRun> {
  const runId = defaultRunId();
  const artifactDirectory = resolve(root, runId);
  await mkdir(artifactDirectory, { recursive: true });

  return {
    runId,
    artifactDirectory,
    writeStage: (fileName, value) =>
      writeFile(
        resolve(artifactDirectory, fileName),
        stringifyArtifact({
          runId,
          stage: fileName.replace(/\.json$/, ''),
          capturedAt: new Date().toISOString(),
          value,
        }),
        'utf8',
      ),
  };
}

function defaultRunId(): string {
  const timestamp = new Date().toISOString().replaceAll(/[-:.TZ]/g, '');
  return `backtest-debug-${timestamp}-${randomUUID().slice(0, 8)}`;
}

function stringifyArtifact(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
