import { z } from 'zod';

export const diagnoseEvidenceSchema = z.object({
  ref: z.string().min(1),
  turn: z.number().int().positive().optional(),
  timestamp: z.string().optional(),
  summary: z.string().min(1),
});

export const diagnosePatternSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  confidence: z.number().min(0).max(1),
  diagnosis: z.string().min(1),
  likelyCause: z.string().min(1),
  suggestedFix: z.string().min(1),
  evidence: z.array(diagnoseEvidenceSchema).max(12),
});

export const diagnoseLlmFindingSchema = diagnosePatternSchema.extend({
  source: z.literal('llm').default('llm'),
});

export const diagnoseLlmResultSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(diagnoseLlmFindingSchema).max(8),
});

export type DiagnoseSeverityDto = z.infer<typeof diagnosePatternSchema>['severity'];
export type DiagnoseEvidenceDto = z.infer<typeof diagnoseEvidenceSchema>;
export type DiagnosePatternDto = z.infer<typeof diagnosePatternSchema>;
export type DiagnoseLlmFindingDto = z.infer<typeof diagnoseLlmFindingSchema>;

export interface DiagnoseResponseDto {
  runId: string;
  artifactDirectory: string;
  jobId: string;
  startTurn: number;
  endTurn: number;
  summary: string;
  patterns: DiagnosePatternDto[];
  llmFindings: DiagnoseLlmFindingDto[];
  noFindings: boolean;
}
