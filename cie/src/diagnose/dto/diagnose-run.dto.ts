import { z } from 'zod';

export const diagnoseRunIdParamSchema = z.object({
  runId: z.string().regex(/^diagnose-[A-Za-z0-9_-]+$/),
});

export const diagnoseRunSummarySchema = z.object({
  runId: z.string(),
  artifactDirectory: z.string(),
  jobId: z.string(),
  startTurn: z.number().int().positive(),
  endTurn: z.number().int().positive(),
  summary: z.string(),
  findingCount: z.number().int().nonnegative(),
  createdAt: z.string().optional(),
});

export const diagnoseRunsResponseSchema = z.object({
  runs: z.array(diagnoseRunSummarySchema),
});

export type DiagnoseRunIdParamDto = z.infer<typeof diagnoseRunIdParamSchema>;
export type DiagnoseRunSummaryDto = z.infer<typeof diagnoseRunSummarySchema>;
export type DiagnoseRunsResponseDto = z.infer<typeof diagnoseRunsResponseSchema>;
