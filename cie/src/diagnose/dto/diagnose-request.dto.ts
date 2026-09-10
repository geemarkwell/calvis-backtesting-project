import { z } from 'zod';

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
  })
  .refine((request) => /^\d+$/.test(request.jobId), {
    path: ['jobId'],
    message: 'jobId must contain digits only.',
  })
  .refine((request) => request.startTurn <= request.endTurn, {
    path: ['endTurn'],
    message: 'endTurn must be greater than or equal to startTurn.',
  });

export type DiagnoseRequestDto = z.infer<typeof diagnoseRequestSchema>;
