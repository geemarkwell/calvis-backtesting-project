import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { copilotReplayTools } from '../copilot/replay-tools';
import type { CopilotRequestContext } from '../copilot/types';

const recordedToolCallSchema = z.object({
  turn: z.number().int().positive(),
  timestamp: z.string(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
  output: z.unknown(),
  ok: z.boolean().optional(),
  error: z.string().nullable().optional(),
});

export const copilotModelConfiguration = {
  model: 'openai/gpt-5-mini',
  maxRetries: 0,
  maxSteps: 8,
} as const;

const observedToolCallSchema = z.object({
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
});

const replayToolTraceSchema = z.object({
  turn: z.number().int().positive(),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
  resolution: z.enum([
    'recorded',
    'simulated_side_effect',
    'shift_data',
    'unavailable_in_replay',
  ]),
  matchedRecordedCall: z
    .object({
      timestamp: z.string(),
      input: z.record(z.string(), z.unknown()),
    })
    .optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export const copilot = new Agent<
  'copilot',
  typeof copilotReplayTools,
  undefined,
  CopilotRequestContext
>({
  id: 'copilot',
  name: 'Copilot',
  description:
    'Replays Calvis guard-supervision behavior against versioned prompts and recorded shift evidence.',
  instructions: ({ requestContext }) => {
    const systemPrompt = requestContext.get('copilot-system-prompt');

    if (!systemPrompt?.trim()) {
      throw new Error(
        'Copilot requires a non-empty copilot-system-prompt in request context.',
      );
    }

    return systemPrompt;
  },
  model: copilotModelConfiguration.model,
  tools: copilotReplayTools,
  maxRetries: copilotModelConfiguration.maxRetries,
  defaultOptions: {
    maxSteps: copilotModelConfiguration.maxSteps,
  },
  requestContextSchema: z.object({
    'copilot-system-prompt': z.string().min(1),
    'copilot-replay-tool-calls': z.array(recordedToolCallSchema).optional(),
    'copilot-replay-mode': z.enum(['original', 'candidate']),
    'copilot-active-turn': z.number().int().positive().optional(),
    'copilot-active-timestamp': z.string().optional(),
    'copilot-replay-evidence': z.object({
      shift: z
        .object({ id: z.union([z.string(), z.number()]) })
        .catchall(z.unknown()),
      events: z.array(
        z.object({ ts: z.string(), type: z.string() }).catchall(z.unknown()),
      ),
      copilotMessages: z.array(z.object({ ts: z.string(), text: z.string() })),
    }),
    'copilot-virtual-workspace': z.record(z.string(), z.string()),
    'copilot-tool-trace': z.array(replayToolTraceSchema).optional(),
    'copilot-observed-tool-calls': z.array(observedToolCallSchema).optional(),
  }),
  editor: false,
});
