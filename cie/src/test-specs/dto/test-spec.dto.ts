import { z } from 'zod';
import { testCriterionSchema } from '../../test-criteria/dto/draft-test-criteria-response.dto';

const nonEmptyTextSchema = z
  .string()
  .trim()
  .min(1, 'Text must contain a non-whitespace character.');

const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'ID must be a lowercase slug.');

const testSpecFields = {
  id: slugSchema.max(100),
  version: z.string().regex(/^\d+$/, 'Version must be a positive integer.'),
  name: nonEmptyTextSchema.max(160),
  description: nonEmptyTextSchema.max(1_000).optional(),
  userQuestion: nonEmptyTextSchema.max(2_000),
  agentSurface: nonEmptyTextSchema.max(120),
  criteria: z.array(testCriterionSchema).min(3).max(10),
  requiredEvidence: z.array(nonEmptyTextSchema.max(200)).min(1).max(20),
  passCondition: nonEmptyTextSchema.max(1_000),
  assumptions: z.array(nonEmptyTextSchema.max(500)).max(10),
  limitations: z.array(nonEmptyTextSchema.max(500)).max(10),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
};

function rejectDuplicateCriteria(
  spec: { criteria: { id: string }[] },
  context: z.RefinementCtx,
): void {
  const seenCriteria = new Set<string>();
  spec.criteria.forEach((criterion, index) => {
    if (seenCriteria.has(criterion.id)) {
      context.addIssue({
        code: 'custom',
        path: ['criteria', index, 'id'],
        message: `Duplicate criterion ID: ${criterion.id}.`,
      });
    }
    seenCriteria.add(criterion.id);
  });
}

export const savedTestSpecSchema = z
  .object(testSpecFields)
  .strict()
  .superRefine(rejectDuplicateCriteria);

export const createTestSpecSchema = z
  .object({
    id: testSpecFields.id.optional(),
    version: z.union([z.literal('draft'), testSpecFields.version]).optional(),
    name: testSpecFields.name,
    description: testSpecFields.description,
    userQuestion: testSpecFields.userQuestion,
    agentSurface: testSpecFields.agentSurface,
    criteria: testSpecFields.criteria,
    requiredEvidence: testSpecFields.requiredEvidence,
    passCondition: testSpecFields.passCondition,
    assumptions: testSpecFields.assumptions,
    limitations: testSpecFields.limitations,
  })
  .strict()
  .superRefine(rejectDuplicateCriteria);

export const updateTestSpecSchema = z
  .object({
    version: z.union([z.literal('draft'), testSpecFields.version]).optional(),
    name: testSpecFields.name,
    description: testSpecFields.description,
    userQuestion: testSpecFields.userQuestion,
    agentSurface: testSpecFields.agentSurface,
    criteria: testSpecFields.criteria,
    requiredEvidence: testSpecFields.requiredEvidence,
    passCondition: testSpecFields.passCondition,
    assumptions: testSpecFields.assumptions,
    limitations: testSpecFields.limitations,
  })
  .strict()
  .superRefine(rejectDuplicateCriteria);

export const testSpecIdParamSchema = z
  .object({ id: slugSchema.max(100) })
  .strict();

export type SavedTestSpecDto = z.infer<typeof savedTestSpecSchema>;
export type CreateTestSpecDto = z.infer<typeof createTestSpecSchema>;
export type UpdateTestSpecDto = z.infer<typeof updateTestSpecSchema>;
export type TestSpecIdParamDto = z.infer<typeof testSpecIdParamSchema>;
