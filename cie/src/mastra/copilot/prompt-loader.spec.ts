import { resolve } from 'node:path';
import {
  assembleCopilotSystemPrompt,
  CORE_PROMPT_FILES,
  findPromptRoot,
} from './prompt-loader';

const promptRoot = resolve(process.cwd(), '..', 'prompts');

describe('copilot prompt loader', () => {
  it('locates the bundle prompt directory from the app directory', async () => {
    await expect(findPromptRoot(process.cwd())).resolves.toBe(promptRoot);
  });

  it('assembles core files in production order and injects shift context', async () => {
    const prompt = await assembleCopilotSystemPrompt({
      promptRoot,
      shift: { id: '56370', guard: { name: 'Hector Nguyen' } },
    });

    const headings = [
      '# Who You Are',
      '# Your Shift',
      '# Holding the Post',
      '# What the Shift Owes',
      '# Communication Policy',
      '# Tools',
    ];

    expect(CORE_PROMPT_FILES).toHaveLength(6);
    expect(headings.map((heading) => prompt.indexOf(heading))).toEqual(
      [...headings.map((heading) => prompt.indexOf(heading))].sort(
        (left, right) => left - right,
      ),
    );
    expect(prompt).toContain('"id": "56370"');
    expect(prompt).toContain('"name": "Hector Nguyen"');
    expect(prompt).not.toContain('{COPILOT_CONTEXT}');
  });

  it('rejects shift context without an id', async () => {
    await expect(
      assembleCopilotSystemPrompt({
        promptRoot,
        shift: {} as never,
      }),
    ).rejects.toThrow('must include an id');
  });

  it('fails clearly when a prompt version is missing', async () => {
    await expect(
      assembleCopilotSystemPrompt({
        promptRoot: resolve(promptRoot, 'missing-version'),
        shift: { id: '56370' },
      }),
    ).rejects.toThrow();
  });
});
