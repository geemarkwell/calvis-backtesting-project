import { z } from 'zod';
import { candidateKindSchema } from './schemas';

export const theoArtifactKindSchema = z.enum([
  'prompt_file',
  'tool_schema',
  'context_field',
  'workflow_state',
  'code_path',
  'test_artifact',
  'none',
]);

export const theoArtifactRequestSchema = z
  .object({
    kind: theoArtifactKindSchema,
    id: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export const theoTriageSchema = z
  .object({
    candidateKind: candidateKindSchema,
    rationale: z.string().min(1),
    confidence: z.number().min(0).max(1),
    needsAdditionalArtifacts: z.boolean(),
    requestedArtifacts: z.array(theoArtifactRequestSchema),
  })
  .strict();

export type TheoTriage = z.infer<typeof theoTriageSchema>;

export function buildTheoTriageMessage(caseBrief: string): string {
  return `You are triaging a Copilot issue for candidate intervention planning.

Decide the smallest likely candidate kind. You may request one focused artifact expansion if needed.
Do not write a final fix. Do not request broad artifact sets. Prompt file requests must name exact paths.

${caseBrief}`;
}

export function fallbackTheoTriage(): TheoTriage {
  return {
    candidateKind: 'prompt',
    rationale: 'Fallback triage preserves legacy one-call prompt-candidate behavior for local/test runners.',
    confidence: 0.5,
    needsAdditionalArtifacts: true,
    requestedArtifacts: [],
  };
}
