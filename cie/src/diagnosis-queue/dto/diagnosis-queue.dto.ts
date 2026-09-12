import { z } from 'zod';

export const enqueueDiagnosisJobSchema = z.object({
  jobId: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
  sourceSessionId: z.string().trim().min(1).optional(),
  reason: z.string().trim().min(1).max(120).default('manual_live_copilot_logs'),
  requestedBy: z.string().trim().min(1).max(120).default('web-app2'),
  replaySource: z.literal('production').default('production'),
  scope: z.literal('full-job').default('full-job'),
}).refine((request) => /^\d+$/.test(request.jobId), {
  path: ['jobId'],
  message: 'jobId must contain digits only.',
});

export const diagnosisQueueStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);

export const listDiagnosisQueueSchema = z.object({
  status: diagnosisQueueStatusSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const diagnosisQueueIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const clearDiagnosisQueueSchema = z.object({
  status: z.enum(['queued', 'completed', 'failed']).optional(),
});

export const finishDiagnosisQueueJobSchema = z.object({
  jobId: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
  diagnosisRunId: z.string().trim().min(1).optional(),
  errorMessage: z.string().trim().min(1).max(4000).optional(),
}).refine((request) => /^\d+$/.test(request.jobId), {
  path: ['jobId'],
  message: 'jobId must contain digits only.',
});

export const sweepStartDiagnosisQueueSchema = z.object({
  lookbackHours: z.coerce.number().int().positive().max(24 * 14).default(24),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type DiagnosisQueueStatusDto = z.infer<typeof diagnosisQueueStatusSchema>;
export type EnqueueDiagnosisJobDto = z.infer<typeof enqueueDiagnosisJobSchema>;
export type ListDiagnosisQueueDto = z.infer<typeof listDiagnosisQueueSchema>;
export type DiagnosisQueueIdParamDto = z.infer<typeof diagnosisQueueIdParamSchema>;
export type ClearDiagnosisQueueDto = z.infer<typeof clearDiagnosisQueueSchema>;
export type FinishDiagnosisQueueJobDto = z.infer<typeof finishDiagnosisQueueJobSchema>;
export type SweepStartDiagnosisQueueDto = z.infer<typeof sweepStartDiagnosisQueueSchema>;

export interface DiagnosisQueueItemDto {
  id: string;
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  reason: string;
  requestedBy: string;
  replaySource: 'production';
  scope: 'full-job';
  sourceSessionId: string | null;
  diagnosisRunId: string | null;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface EnqueueDiagnosisJobResponseDto {
  item: DiagnosisQueueItemDto;
  created: boolean;
}

export interface DiagnosisQueueResponseDto {
  items: DiagnosisQueueItemDto[];
  count: number;
}

export interface ClearDiagnosisQueueResponseDto {
  deleted: number;
}

export interface SweepStartDiagnosisQueueResponseDto {
  scanned: number;
  enqueued: DiagnosisQueueItemDto[];
  skippedJobIds: string[];
  started: DiagnosisQueueItemDto | null;
  completed: DiagnosisQueueItemDto | null;
  diagnosisRunId: string | null;
  errorMessage: string | null;
}
