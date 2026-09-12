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
    scope: z.enum(['full-job', 'turn-window']).optional(),
    startTurn: positiveTurn.optional(),
    endTurn: positiveTurn.optional(),
    lensIds: z.array(diagnoseLensIdSchema).min(1).max(6).optional(),
    useCompactContext: z.boolean().optional(),
    replaySource: z.literal('production').optional(),
  })
  .transform((request) => ({
    ...request,
    scope: request.scope ?? (request.startTurn === undefined && request.endTurn === undefined ? 'full-job' : 'turn-window'),
  }))
  .refine((request) => /^\d+$/.test(request.jobId), {
    path: ['jobId'],
    message: 'jobId must contain digits only.',
  })
  .refine(
    (request) =>
      request.scope === 'full-job' ||
      (request.startTurn !== undefined && request.endTurn !== undefined),
    {
      path: ['startTurn'],
      message: 'startTurn and endTurn are required for turn-window diagnosis.',
    },
  )
  .refine(
    (request) =>
      request.startTurn === undefined ||
      request.endTurn === undefined ||
      request.startTurn <= request.endTurn,
    {
      path: ['endTurn'],
      message: 'endTurn must be greater than or equal to startTurn.',
    },
  )
  .refine(
    (request) => !request.lensIds || new Set(request.lensIds).size === request.lensIds.length,
    {
      path: ['lensIds'],
      message: 'lensIds must not contain duplicates.',
    },
  );

export type DiagnoseRequestDto = z.infer<typeof diagnoseRequestSchema>;
