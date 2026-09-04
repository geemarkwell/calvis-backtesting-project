import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CopilotShift } from './types';

const CORE_PROMPT_FILES = [
  'identity.md',
  'context.md',
  'holding_the_post.md',
  'obligations.md',
  'comms_policy.md',
  'tools.md',
] as const;

const CONTEXT_PLACEHOLDER = '{COPILOT_CONTEXT}';

export interface AssembleCopilotPromptInput {
  promptRoot: string;
  shift: CopilotShift;
}

export async function findPromptRoot(cwd = process.cwd()): Promise<string> {
  const configuredRoot = process.env.CALVIS_PROMPT_ROOT;
  const candidates = [
    configuredRoot,
    resolve(cwd, 'prompts'),
    resolve(cwd, '..', 'prompts'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      await access(resolve(candidate, 'PROMPTS.md'));
      return candidate;
    } catch {
      // Try the next supported bundle layout.
    }
  }

  throw new Error(
    'Unable to locate prompts/PROMPTS.md. Set CALVIS_PROMPT_ROOT to the prompts directory.',
  );
}

export async function assembleCopilotSystemPrompt({
  promptRoot,
  shift,
}: AssembleCopilotPromptInput): Promise<string> {
  if (!shift || shift.id === undefined || shift.id === null) {
    throw new Error('Copilot shift context must include an id.');
  }

  const coreSections = await Promise.all(
    CORE_PROMPT_FILES.map(async (fileName) => {
      const contents = await readFile(
        resolve(promptRoot, 'core', fileName),
        'utf8',
      );

      if (!contents.trim()) {
        throw new Error(`Core prompt file is empty: ${fileName}`);
      }

      return contents.trimEnd();
    }),
  );

  const assembledPrompt = coreSections.join('\n\n');
  const placeholderCount =
    assembledPrompt.split(CONTEXT_PLACEHOLDER).length - 1;

  if (placeholderCount !== 1) {
    throw new Error(
      `Expected exactly one ${CONTEXT_PLACEHOLDER} placeholder; found ${placeholderCount}.`,
    );
  }

  return assembledPrompt.replace(
    CONTEXT_PLACEHOLDER,
    JSON.stringify(shift, null, 2),
  );
}

export { CORE_PROMPT_FILES };
