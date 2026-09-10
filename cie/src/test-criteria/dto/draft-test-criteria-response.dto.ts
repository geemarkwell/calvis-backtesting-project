import { z } from 'zod';

const nonEmptyTextSchema = z
  .string()
  .trim()
  .min(1, 'Text must contain a non-whitespace character.');

const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'ID must be a lowercase slug.');

export const testCriterionSchema = z
  .object({
    id: slugSchema.max(80),
    importance: z.enum(['critical', 'major', 'minor']),
    description: nonEmptyTextSchema.max(1_000),
    passRule: nonEmptyTextSchema.max(1_000),
    evidenceNeeded: z.array(nonEmptyTextSchema.max(200)).max(12).optional(),
  })
  .strict();

export const draftTestSpecSchema = z
  .object({
    id: slugSchema.max(100),
    version: z.literal('draft'),
    name: nonEmptyTextSchema.max(160),
    description: nonEmptyTextSchema.max(1_000).optional(),
    userQuestion: nonEmptyTextSchema.max(2_000),
    agentSurface: nonEmptyTextSchema.max(120),
    criteria: z.array(testCriterionSchema).min(3).max(10),
    requiredEvidence: z.array(nonEmptyTextSchema.max(200)).min(1).max(20),
    passCondition: nonEmptyTextSchema.max(1_000),
    assumptions: z.array(nonEmptyTextSchema.max(500)).max(10),
    limitations: z.array(nonEmptyTextSchema.max(500)).max(10),
  })
  .strict();

export const draftTestCriteriaResponseSchema = z
  .object({
    runId: nonEmptyTextSchema,
    artifactDirectory: nonEmptyTextSchema,
    testSpec: draftTestSpecSchema,
  })
  .strict();

export type TestCriterionDto = z.infer<typeof testCriterionSchema>;
export type DraftTestSpecDto = z.infer<typeof draftTestSpecSchema>;
export type DraftTestCriteriaResponseDto = z.infer<
  typeof draftTestCriteriaResponseSchema
>;
