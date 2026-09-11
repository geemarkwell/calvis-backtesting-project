import { z } from 'zod';
import { diagnoseLensIdSchema } from './diagnose-lens.dto';

const positiveTurn = z.coerce
  .number()
  .int()
  .positive()
  .max(100_000);

export const diagnoseRequestSchema = z
  .object({
    jobId: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
    startTurn: positiveTurn,
    endTurn: positiveTurn,
    lensIds: z.array(diagnoseLensIdSchema).min(1).max(6).optional(),
    useCompactContext: z.boolean().optional(),
    replaySource: z.enum(['file', 'production']).optional(),
  })
  .refine((request) => /^\d+$/.test(request.jobId), {
    path: ['jobId'],
    message: 'jobId must contain digits only.',
  })
  .refine((request) => request.startTurn <= request.endTurn, {
    path: ['endTurn'],
    message: 'endTurn must be greater than or equal to startTurn.',
  })
  .refine(
    (request) => !request.lensIds || new Set(request.lensIds).size === request.lensIds.length,
    {
      path: ['lensIds'],
      message: 'lensIds must not contain duplicates.',
    },
  );

export type DiagnoseRequestDto = z.infer<typeof diagnoseRequestSchema>;
