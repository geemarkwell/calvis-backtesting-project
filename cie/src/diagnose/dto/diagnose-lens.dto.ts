import { z } from 'zod';

export const diagnoseLensIdSchema = z.enum([
  'policy-role-authority',
  'policy-uniform-attire',
  'policy-time-scheduling',
  'policy-checkin-checkout',
  'policy-patrol-expectations',
  'policy-escalation-rules',
  // Legacy lens IDs are accepted so old saved runs and explicit callers do not break.
  'task-success',
  'tool-use',
  'context',
  'safety-recovery',
  'prompt-issue',
  'free-agent',
]);

export const diagnoseLensSchema = z.object({
  id: diagnoseLensIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  focusAreas: z.array(z.string().min(1)).min(1),
  exclusions: z.array(z.string().min(1)).min(1),
});

export type DiagnoseLensIdDto = z.infer<typeof diagnoseLensIdSchema>;
export type DiagnoseLensDto = z.infer<typeof diagnoseLensSchema>;
