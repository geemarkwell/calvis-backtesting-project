import { z } from 'zod';

const nonEmptyTextSchema = z
  .string()
  .trim()
  .min(1, 'Text must contain a non-whitespace character.');

const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'ID must be a lowercase slug.');

export const evaluateTestRequestSchema = z
  .object({
    testSpecId: slugSchema.max(100),
    jobId: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
    startTurn: z.number().int().positive().optional(),
    endTurn: z.number().int().positive().optional(),
    source: z.enum(['shift', 'simulation']).optional(),
    simulationNumber: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (
      request.startTurn !== undefined &&
      request.endTurn !== undefined &&
      request.startTurn > request.endTurn
    ) {
      context.addIssue({
        code: 'custom',
        path: ['startTurn'],
        message: 'startTurn cannot be greater than endTurn.',
      });
    }
    if (request.source === 'simulation' && request.simulationNumber === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['simulationNumber'],
        message: 'simulationNumber is required when source is simulation.',
      });
    }
  });

export type EvaluateTestRequestDto = z.infer<typeof evaluateTestRequestSchema>;
