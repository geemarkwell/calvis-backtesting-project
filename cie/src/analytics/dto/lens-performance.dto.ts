import { z } from 'zod';

export const analyticsRangeSchema = z.enum(['day', 'week']).default('day');

export const lensPerformanceQuerySchema = z.object({
  range: analyticsRangeSchema.optional(),
});

export type AnalyticsRangeDto = z.infer<typeof analyticsRangeSchema>;
export type LensPerformanceQueryDto = z.infer<typeof lensPerformanceQuerySchema>;

export interface LensPerformanceRowDto {
  lensId: string;
  lensName: string;
  diagnosisFindingCount: number;
  mayaEvalCount: number;
  mayaPassCount: number;
  mayaFailCount: number;
  mayaPassRate: number | null;
}

export interface MayaOutcomeBucketDto {
  bucket: string;
  passCount: number;
  failCount: number;
  totalCount: number;
}

export interface LensPerformanceResponseDto {
  range: AnalyticsRangeDto;
  generatedAt: string;
  summary: {
    diagnosisFindingCount: number;
    mayaEvalCount: number;
    mayaPassCount: number;
    mayaFailCount: number;
    mayaPassRate: number | null;
  };
  lenses: LensPerformanceRowDto[];
  mostDiagnosisFailures: LensPerformanceRowDto[];
  mostMayaPasses: LensPerformanceRowDto[];
  mostMayaFails: LensPerformanceRowDto[];
  mayaOutcomeTrend: MayaOutcomeBucketDto[];
}
