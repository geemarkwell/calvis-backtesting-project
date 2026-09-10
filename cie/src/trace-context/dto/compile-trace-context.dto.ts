import { z } from 'zod';

export const traceContextPurposeSchema = z.enum([
  'diagnose',
  'theo',
  'replay',
  'maya',
]);

export const compileTraceContextInputSchema = z.object({
  purpose: traceContextPurposeSchema,
  maxMessages: z.number().int().positive().optional(),
  maxEvents: z.number().int().positive().optional(),
  maxTextChars: z.number().int().positive().optional(),
});

export type TraceContextPurposeDto = z.infer<typeof traceContextPurposeSchema>;
export type CompileTraceContextInputDto = z.infer<
  typeof compileTraceContextInputSchema
>;

export interface CompactTraceContextDto {
  purpose: TraceContextPurposeDto;
  summary: string;
  messages: Array<{
    ref: string;
    timestamp?: string;
    role: 'guard' | 'copilot' | 'agent' | 'unknown';
    text: string;
  }>;
  eventTimeline: Array<{
    ref: string;
    timestamp?: string;
    type: string;
    summary: string;
  }>;
  toolCounts: Array<{
    tool: string;
    count: number;
    failures: number;
  }>;
  failedTools: Array<{
    ref: string;
    tool: string;
    summary: string;
  }>;
  importantActions: Array<{
    ref: string;
    timestamp?: string;
    tool: string;
    summary: string;
  }>;
  telemetrySummary: string | null;
  evidenceRefs: string[];
  omissions: string[];
  budget: {
    maxMessages: number;
    maxEvents: number;
    maxTextChars: number;
    inputItems: number;
    outputItems: number;
    estimatedChars: number;
  };
}
