import { z } from 'zod';

const nonEmptyTextSchema = z
  .string()
  .trim()
  .min(1, 'Text must contain a non-whitespace character.');

export const criterionEvaluationSchema = z
  .object({
    criterionId: nonEmptyTextSchema.max(80),
    status: z.enum(['pass', 'fail', 'warning']),
    summary: nonEmptyTextSchema.max(1_000),
    evidenceRefs: z.array(nonEmptyTextSchema.max(120)).max(20),
  })
  .strict();

export const testEvaluationVerdictSchema = z
  .object({
    verdict: z.enum(['good', 'bad']),
    passed: z.boolean(),
    confidence: z.number().min(0).max(1),
    summary: nonEmptyTextSchema.max(1_500),
    criteriaResults: z.array(criterionEvaluationSchema).min(1).max(20),
    suggestedFix: z
      .object({
        category: z.enum([
          'prompt',
          'tool',
          'context',
          'workflow',
          'model',
          'code',
          'test',
          'unknown',
        ]),
        summary: nonEmptyTextSchema.max(1_000),
      })
      .strict(),
    limitations: z.array(nonEmptyTextSchema.max(500)).max(10),
  })
  .strict();

export const evaluateTestResponseSchema = z
  .object({
    runId: nonEmptyTextSchema,
    artifactDirectory: nonEmptyTextSchema,
    testSpecId: nonEmptyTextSchema,
    jobId: nonEmptyTextSchema,
    startTurn: z.number().int().positive(),
    endTurn: z.number().int().positive(),
    verdict: testEvaluationVerdictSchema,
  })
  .strict();

export type TestEvaluationVerdictDto = z.infer<
  typeof testEvaluationVerdictSchema
>;
export type EvaluateTestResponseDto = z.infer<typeof evaluateTestResponseSchema>;
