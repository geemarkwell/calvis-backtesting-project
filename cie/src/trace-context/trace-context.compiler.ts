import { baseToolName } from '../copilot-simulation/output-comparison';
import type { NormalizedTraceEntry } from '../mastra/theo/trace-normalizer';
import type {
  CompactTraceContextDto,
  TraceContextPurposeDto,
} from './dto/compile-trace-context.dto';

const ACTION_TOOLS = new Set([
  'add_copilot_note',
  'create_copilot_alert',
  'create_copilot_task',
  'create_feature_request',
  'escalate_to_human',
  'escalate_to_ops',
  'flag_copilot_guard',
  'request_copilot_dm',
]);

const DEFAULT_BUDGETS: Record<
  TraceContextPurposeDto,
  { maxMessages: number; maxEvents: number; maxTextChars: number }
> = {
  diagnose: { maxMessages: 30, maxEvents: 50, maxTextChars: 500 },
  theo: { maxMessages: 24, maxEvents: 35, maxTextChars: 420 },
  replay: { maxMessages: 18, maxEvents: 25, maxTextChars: 360 },
  maya: { maxMessages: 36, maxEvents: 40, maxTextChars: 420 },
};

export function compileTraceContext({
  trace,
  purpose,
  maxMessages,
  maxEvents,
  maxTextChars,
}: {
  trace: readonly NormalizedTraceEntry[];
  purpose: TraceContextPurposeDto;
  maxMessages?: number;
  maxEvents?: number;
  maxTextChars?: number;
}): CompactTraceContextDto {
  const budget = {
    ...DEFAULT_BUDGETS[purpose],
    ...(maxMessages ? { maxMessages } : {}),
    ...(maxEvents ? { maxEvents } : {}),
    ...(maxTextChars ? { maxTextChars } : {}),
  };
  const messages = trace
    .filter((entry) => entry.type === 'guard_message' || entry.type === 'copilot_message')
    .slice(-budget.maxMessages)
    .map((entry) => ({
      ref: entry.ref,
      timestamp: entry.timestamp,
      role: roleForEntry(entry),
      text: truncate(textOf(entry.content), budget.maxTextChars),
    }));
  const eventTimeline = trace
    .filter((entry) => entry.source === 'events' && entry.type !== 'guard_message')
    .slice(-budget.maxEvents)
    .map((entry) => ({
      ref: entry.ref,
      timestamp: entry.timestamp,
      type: entry.type,
      summary: truncate(textOf(entry.content), budget.maxTextChars),
    }));
  const toolEntries = trace.filter((entry) => entry.type === 'tool_call');
  const toolCounts = summarizeTools(toolEntries);
  const failedTools = toolEntries
    .filter((entry) => toolFailed(entry.content))
    .slice(-12)
    .map((entry) => ({
      ref: entry.ref,
      tool: toolName(entry.content),
      summary: truncate(textOf(toolError(entry.content)), budget.maxTextChars),
    }));
  const importantActions = toolEntries
    .filter((entry) => ACTION_TOOLS.has(toolName(entry.content)))
    .slice(-20)
    .map((entry) => ({
      ref: entry.ref,
      timestamp: entry.timestamp,
      tool: toolName(entry.content),
      summary: truncate(textOf(toolInput(entry.content)), budget.maxTextChars),
    }));
  const telemetrySummary = summarizeTelemetry(trace);
  const outputItems =
    messages.length +
    eventTimeline.length +
    toolCounts.length +
    failedTools.length +
    importantActions.length;
  const context: CompactTraceContextDto = {
    purpose,
    summary: `${trace.length} trace items compacted for ${purpose}: ${messages.length} messages, ${eventTimeline.length} events, ${toolEntries.length} tool calls across ${toolCounts.length} tools.`,
    messages,
    eventTimeline,
    toolCounts,
    failedTools,
    importantActions,
    telemetrySummary,
    evidenceRefs: [...new Set([...messages, ...eventTimeline, ...failedTools, ...importantActions].map((item) => item.ref))],
    omissions: buildOmissions(trace, messages.length, eventTimeline.length, toolEntries.length),
    budget: {
      ...budget,
      inputItems: trace.length,
      outputItems,
      estimatedChars: JSON.stringify({ messages, eventTimeline, toolCounts, failedTools, importantActions, telemetrySummary }).length,
    },
  };
  return context;
}

function summarizeTools(entries: readonly NormalizedTraceEntry[]) {
  const counts = new Map<string, { tool: string; count: number; failures: number }>();
  for (const entry of entries) {
    const tool = toolName(entry.content);
    const current = counts.get(tool) ?? { tool, count: 0, failures: 0 };
    current.count += 1;
    if (toolFailed(entry.content)) current.failures += 1;
    counts.set(tool, current);
  }
  return [...counts.values()].sort((left, right) => right.count - left.count);
}

function buildOmissions(
  trace: readonly NormalizedTraceEntry[],
  messagesKept: number,
  eventsKept: number,
  toolCount: number,
): string[] {
  const totalMessages = trace.filter((entry) => entry.type === 'guard_message' || entry.type === 'copilot_message').length;
  const totalEvents = trace.filter((entry) => entry.source === 'events' && entry.type !== 'guard_message').length;
  const omissions: string[] = [];
  if (totalMessages > messagesKept) omissions.push(`${totalMessages - messagesKept} older messages omitted.`);
  if (totalEvents > eventsKept) omissions.push(`${totalEvents - eventsKept} older events omitted.`);
  if (toolCount > 0) omissions.push(`${toolCount} tool calls summarized as counts; raw inputs/outputs omitted except failures and important actions.`);
  return omissions;
}

function roleForEntry(entry: NormalizedTraceEntry): 'guard' | 'copilot' | 'agent' | 'unknown' {
  if (entry.type === 'guard_message') return 'guard';
  if (entry.type === 'copilot_message') return 'copilot';
  return 'unknown';
}

function toolName(content: unknown): string {
  return isRecord(content) ? baseToolName(String(content.tool ?? 'unknown')) : 'unknown';
}

function toolInput(content: unknown): unknown {
  return isRecord(content) ? content.input : undefined;
}

function toolError(content: unknown): unknown {
  return isRecord(content) ? content.error ?? content.output : content;
}

function toolFailed(content: unknown): boolean {
  return isRecord(content) && (content.ok === false || Boolean(content.error));
}

function summarizeTelemetry(trace: readonly NormalizedTraceEntry[]): string | null {
  const locationTools = trace.filter((entry) => /location|telemetry|ping/i.test(JSON.stringify(entry.content)));
  return locationTools.length > 0
    ? `${locationTools.length} location/telemetry-related trace items present; raw pings omitted in compact context.`
    : null;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.text === 'string') return value.text;
  return JSON.stringify(value ?? null);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
