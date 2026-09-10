import { z } from 'zod';
import { diagnoseLensSchema } from './diagnose-lens.dto';

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
  expectedBehavior: z.string().min(1).optional(),
  evidence: z.array(diagnoseEvidenceSchema).max(12),
});

export const diagnoseLlmFindingSchema = diagnosePatternSchema.extend({
  source: z.literal('llm').default('llm'),
});

export const diagnoseLlmResultSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(diagnoseLlmFindingSchema).max(8),
});

export const diagnoseEvaluatorIdSchema = z.enum([
  'task-success',
  'tool-use',
  'context',
  'safety-recovery',
  'prompt-issue',
  'free-agent',
]);

export const diagnoseEvaluatorReportSchema = z.object({
  evaluatorId: diagnoseEvaluatorIdSchema,
  evaluatorName: z.string().min(1),
  summary: z.string().min(1),
  findings: z.array(diagnoseLlmFindingSchema).max(8),
  lens: diagnoseLensSchema.optional(),
});

export const diagnoseToolCallSchema = z.object({
  ref: z.string().min(1),
  tool: z.string().min(1),
  turn: z.number().int().positive().optional(),
  timestamp: z.string().optional(),
  ok: z.boolean().nullable().optional(),
  error: z.string().nullable().optional(),
  inputPreview: z.string(),
  outputPreview: z.string().optional(),
});

export const diagnoseToolSummarySchema = z.object({
  tool: z.string().min(1),
  count: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
});

export type DiagnoseSeverityDto = z.infer<typeof diagnosePatternSchema>['severity'];
export type DiagnoseEvidenceDto = z.infer<typeof diagnoseEvidenceSchema>;
export type DiagnosePatternDto = z.infer<typeof diagnosePatternSchema>;
export type DiagnoseLlmFindingDto = z.infer<typeof diagnoseLlmFindingSchema>;
export type DiagnoseEvaluatorReportDto = z.infer<typeof diagnoseEvaluatorReportSchema>;
export type DiagnoseToolCallDto = z.infer<typeof diagnoseToolCallSchema>;
export type DiagnoseToolSummaryDto = z.infer<typeof diagnoseToolSummarySchema>;
export type DiagnoseLensDto = z.infer<typeof diagnoseLensSchema>;

export interface DiagnoseResponseDto {
  runId: string;
  artifactDirectory: string;
  jobId: string;
  startTurn: number;
  endTurn: number;
  summary: string;
  lenses: DiagnoseLensDto[];
  patterns: DiagnosePatternDto[];
  llmFindings: DiagnoseLlmFindingDto[];
  evaluatorReports: DiagnoseEvaluatorReportDto[];
  toolCalls: DiagnoseToolCallDto[];
  toolSummary: DiagnoseToolSummaryDto[];
  noFindings: boolean;
}
