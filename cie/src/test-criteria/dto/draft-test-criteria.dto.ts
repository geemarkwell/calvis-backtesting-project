import { z } from 'zod';

const nonEmptyTextSchema = z
  .string()
  .trim()
  .min(1, 'Text must contain a non-whitespace character.');

export const draftTestCriteriaRequestSchema = z
  .object({
    userQuestion: nonEmptyTextSchema.max(2_000),
    availableEvidence: z.array(nonEmptyTextSchema.max(200)).max(30).optional(),
  })
  .strict();

export type DraftTestCriteriaRequestDto = z.infer<
  typeof draftTestCriteriaRequestSchema
>;
