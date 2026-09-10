import { z } from 'zod';

const nonEmptyTextSchema = z
  .string()
  .trim()
  .min(1, 'Text must contain a non-whitespace character.');

const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'ID must be a lowercase slug.');

export const createTestFailureSchema = z
  .object({
    evaluationRunId: nonEmptyTextSchema.max(160),
    testSpecId: slugSchema.max(100),
    jobId: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
    startTurn: z.number().int().positive(),
    endTurn: z.number().int().positive(),
    verdict: z.literal('bad'),
    summary: nonEmptyTextSchema.max(1_500),
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
    failedCriteria: z
      .array(
        z
          .object({
            criterionId: nonEmptyTextSchema.max(80),
            status: z.literal('fail'),
            summary: nonEmptyTextSchema.max(1_000),
            evidenceRefs: z.array(nonEmptyTextSchema.max(120)).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    artifactDirectory: nonEmptyTextSchema.max(500),
  })
  .strict();

export const savedTestFailureSchema = createTestFailureSchema.extend({
  id: nonEmptyTextSchema.max(160),
  savedAt: z.iso.datetime({ offset: true }),
});

export type CreateTestFailureDto = z.infer<typeof createTestFailureSchema>;
export type SavedTestFailureDto = z.infer<typeof savedTestFailureSchema>;
