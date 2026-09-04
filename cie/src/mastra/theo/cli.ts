import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { theoRequestSchema, type TheoRequest } from './diagnostic-input';
import { runTheo, type TheoRunResult } from './runner';

export async function loadTheoRequest(inputPath: string): Promise<TheoRequest> {
  const contents = await readFile(resolve(inputPath), 'utf8');
  return theoRequestSchema.parse(JSON.parse(contents) as unknown);
}

export async function runTheoCli(
  args: string[],
  diagnose: typeof runTheo = runTheo,
): Promise<TheoRunResult> {
  if (args.length !== 1 || !args[0]?.trim()) {
    throw new Error('Usage: yarn theo:diagnose <request.json>');
  }

  const request = await loadTheoRequest(args[0]);
  return diagnose({ request });
}

if (require.main === module) {
  void runTheoCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(
        `${JSON.stringify(
          {
            runId: result.runId,
            artifactDirectory: result.artifactDirectory,
            candidatePromptJobId: result.candidatePromptJobId,
            candidatePromptVersion: result.candidatePromptVersion,
            candidatePromptRoot: result.candidatePromptRoot,
            diagnosis: result.diagnosis,
            suggestedPromptChange: result.diagnosis.proposed_edit,
          },
          null,
          2,
        )}\n`,
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Theo diagnosis failed: ${message}\n`);
      process.exitCode = 1;
    });
}
