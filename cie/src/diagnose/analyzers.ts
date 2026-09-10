import { baseToolName } from '../copilot-simulation/output-comparison';
import type { ShiftEvent } from '../copilot-simulation/copilot-simulation.types';
import type { NormalizedTraceEntry } from '../mastra/theo/trace-normalizer';
import type { DiagnoseEvidenceDto, DiagnosePatternDto } from './dto/diagnose-response.dto';

export interface DiagnoseWindow {
  trace: NormalizedTraceEntry[];
  intervalEvents: ShiftEvent[];
}

type ToolEntry = NormalizedTraceEntry & {
  content: { tool?: string; input?: Record<string, unknown>; output?: unknown; ok?: boolean; error?: string | null };
};

const HUMAN_PATTERNS = /escalate|human|ops|operator|overwatch/i;
const CLAIM_PATTERNS = /confirmed|verified|completed|on.?site|patrol|checked|reported|secure/i;
const INFO_PATTERNS = /unknown|unavailable|not available|missing|no .*found|failed to|cannot|can't/i;

export function analyzeDiagnoseWindow(window: DiagnoseWindow): DiagnosePatternDto[] {
  const patterns = [
    repeatedToolCalls(window),
    toolErrors(window),
    abandonedTasks(window),
    unsupportedClaims(window),
    missingInformation(window),
    humanIntervention(window),
    addDeleteChurn(window),
    inconsistentSilence(window),
  ].filter((pattern): pattern is DiagnosePatternDto => Boolean(pattern));

  return patterns.sort((left, right) => score(right) - score(left)).slice(0, 8);
}

function repeatedToolCalls(window: DiagnoseWindow): DiagnosePatternDto | null {
  const groups = new Map<string, ToolEntry[]>();
  for (const entry of toolEntries(window.trace)) {
    const key = `${toolName(entry)}:${stableStringify(entry.content.input ?? {})}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const repeated = [...groups.values()].filter((items) => items.length >= 3);
  if (repeated.length === 0) return null;
  const evidence = repeated.flatMap((items) => items.slice(0, 3).map(toolEvidence));
  return pattern({
    id: 'repeated-tool-calls',
    title: 'Repeated tool calls with identical arguments',
    category: 'tool_use',
    severity: 'medium',
    confidence: 0.78,
    diagnosis: 'The agent repeatedly called the same tool with the same arguments inside the selected window.',
    likelyCause: 'The prompt may not make prior tool observations sticky enough, or the agent may be re-checking instead of acting on already-read evidence.',
    suggestedFix: 'Add guidance to summarize consumed tool results before retrying, and only repeat identical reads when new time has elapsed or an earlier call failed.',
    evidence: evidence.slice(0, 6),
  });
}

function toolErrors(window: DiagnoseWindow): DiagnosePatternDto | null {
  const errors = toolEntries(window.trace).filter(
    (entry) => entry.content.ok === false || Boolean(entry.content.error),
  );
  if (errors.length === 0) return null;
  return pattern({
    id: 'tool-errors-bad-arguments',
    title: 'Tool errors or bad arguments',
    category: 'tool_error',
    severity: errors.length >= 3 ? 'high' : 'medium',
    confidence: 0.86,
    diagnosis: 'One or more tool calls failed while the agent was trying to inspect or act on the shift.',
    likelyCause: 'The agent may be using the wrong identifier, omitting session/job scope, or calling tools before it has collected required arguments.',
    suggestedFix: 'Tighten tool-use instructions around required arguments and add recovery guidance after failed reads or side effects.',
    evidence: errors.slice(0, 6).map(toolEvidence),
  });
}

function abandonedTasks(window: DiagnoseWindow): DiagnosePatternDto | null {
  const tasks = toolEntries(window.trace).filter((entry) => toolName(entry).includes('create_copilot_task'));
  const laterMessages = window.trace.filter((entry) => entry.type === 'copilot_message');
  if (tasks.length === 0 || laterMessages.length > 0) return null;
  return pattern({
    id: 'task-created-with-no-guard-followup',
    title: 'Task created without visible guard follow-up',
    category: 'abandoned_task',
    severity: 'medium',
    confidence: 0.66,
    diagnosis: 'The agent created an operational task but did not send any visible copilot message in the selected window.',
    likelyCause: 'The prompt may frame task creation as a substitute for guard coaching instead of a parallel operator-facing action.',
    suggestedFix: 'Clarify when task creation should be paired with a concise guard-facing acknowledgement or coaching message.',
    evidence: tasks.slice(0, 4).map(toolEvidence),
  });
}

function unsupportedClaims(window: DiagnoseWindow): DiagnosePatternDto | null {
  const messages = copilotMessages(window.trace).filter((entry) => CLAIM_PATTERNS.test(textOf(entry.content)));
  const reads = toolEntries(window.trace).filter((entry) => isReadTool(toolName(entry)));
  if (messages.length === 0 || reads.length > 0) return null;
  return pattern({
    id: 'claims-without-supporting-tool-results',
    title: 'Claims appear unsupported by tool results',
    category: 'grounding',
    severity: 'high',
    confidence: 0.62,
    diagnosis: 'The agent made concrete claims about shift state without any read-only evidence tool calls in the selected window.',
    likelyCause: 'The agent may be over-relying on prior context or assumptions rather than checking current logs, chat, or location.',
    suggestedFix: 'Require a fresh evidence check before making concrete claims about completion, location, patrols, incidents, or site security.',
    evidence: messages.slice(0, 5).map(messageEvidence),
  });
}

function missingInformation(window: DiagnoseWindow): DiagnosePatternDto | null {
  const weakReads = toolEntries(window.trace).filter((entry) => INFO_PATTERNS.test(JSON.stringify(entry.content.output ?? entry.content.error ?? '')));
  if (weakReads.length < 2) return null;
  return pattern({
    id: 'missing-information-not-resolved',
    title: 'Missing information was encountered repeatedly',
    category: 'missing_information',
    severity: 'medium',
    confidence: 0.72,
    diagnosis: 'The trace shows repeated unavailable, missing, or failed information while the agent continued the turn sequence.',
    likelyCause: 'The prompt may not specify how to recover from incomplete evidence or when to ask a guard/operator for clarification.',
    suggestedFix: 'Add fallback rules for missing evidence: state uncertainty, ask one targeted question, or escalate only when the missing fact is operationally critical.',
    evidence: weakReads.slice(0, 6).map(toolEvidence),
  });
}

function humanIntervention(window: DiagnoseWindow): DiagnosePatternDto | null {
  const interventions = window.trace.filter((entry) => HUMAN_PATTERNS.test(JSON.stringify(entry.content)));
  if (interventions.length === 0) return null;
  return pattern({
    id: 'human-intervention-associated-pattern',
    title: 'Pattern associated with human intervention',
    category: 'human_intervention',
    severity: 'high',
    confidence: 0.7,
    diagnosis: 'The selected window contains escalation or operator-intervention signals.',
    likelyCause: 'The agent may have reached a confidence or safety boundary, or escalated after failing to resolve ambiguity through tools/messages.',
    suggestedFix: 'Review whether the escalation threshold was met and add clearer criteria for when to coach, wait, ask for evidence, or escalate.',
    evidence: interventions.slice(0, 6).map(genericEvidence),
  });
}

function addDeleteChurn(window: DiagnoseWindow): DiagnosePatternDto | null {
  const writes = toolEntries(window.trace).filter((entry) => ['Write', 'Edit'].includes(toolName(entry)));
  const paths = writes.map((entry) => String(entry.content.input?.file_path ?? entry.content.input?.path ?? '')).filter(Boolean);
  const duplicatePaths = paths.filter((path, index) => paths.indexOf(path) !== index);
  if (duplicatePaths.length === 0) return null;
  return pattern({
    id: 'information-churn',
    title: 'Information repeatedly rewritten in workspace',
    category: 'churn',
    severity: 'low',
    confidence: 0.64,
    diagnosis: 'The agent wrote to the same workspace file multiple times in the selected window.',
    likelyCause: 'The agent may be adding and revising notes instead of maintaining a stable summary of decisions and evidence.',
    suggestedFix: 'Prompt the agent to append durable findings and avoid rewriting the same fact unless it explicitly marks the update as superseding prior analysis.',
    evidence: writes.slice(0, 6).map(toolEvidence),
  });
}

function inconsistentSilence(window: DiagnoseWindow): DiagnosePatternDto | null {
  const guardMessages = window.intervalEvents.filter((event) => event.type === 'guard_message');
  const messages = copilotMessages(window.trace);
  const silentTurns = window.trace.filter((entry) => entry.type === 'turn_start' && entry.silent);
  if (guardMessages.length === 0 || messages.length > 0 || silentTurns.length === 0) return null;
  return pattern({
    id: 'guard-input-with-no-visible-response',
    title: 'Guard input received with no visible response',
    category: 'recovery',
    severity: 'high',
    confidence: 0.68,
    diagnosis: 'The guard provided input during the window, but the selected turns appear to produce no copilot message.',
    likelyCause: 'The agent may have misclassified a guard reply as not requiring response or failed to recover from a quiet-cycle posture.',
    suggestedFix: 'Strengthen reactive guard-message handling so guard replies default to acknowledgement unless the latest assistant already answered the same content.',
    evidence: guardMessages.slice(0, 5).map((event, index) => ({
      ref: `events:${index}`,
      timestamp: event.ts,
      summary: `guard_message: ${truncate(String(event.text ?? event.audio_transcription ?? '[non-text]'), 180)}`,
    })),
  });
}

function toolEntries(trace: NormalizedTraceEntry[]): ToolEntry[] {
  return trace.filter((entry): entry is ToolEntry => entry.type === 'tool_call' && Boolean(entry.content));
}

function copilotMessages(trace: NormalizedTraceEntry[]): NormalizedTraceEntry[] {
  return trace.filter((entry) => entry.type === 'copilot_message');
}

function toolName(entry: ToolEntry): string {
  return baseToolName(String(entry.content.tool ?? 'unknown'));
}

function isReadTool(name: string): boolean {
  return /get_|Read|Glob|Grep|fetch/i.test(name) && !/request|create|add|escalate|flag/i.test(name);
}

function toolEvidence(entry: ToolEntry): DiagnoseEvidenceDto {
  return {
    ref: entry.ref,
    turn: turnNumber(entry),
    timestamp: entry.timestamp,
    summary: `${toolName(entry)} ${truncate(stableStringify(entry.content.input ?? {}), 180)}`,
  };
}

function messageEvidence(entry: NormalizedTraceEntry): DiagnoseEvidenceDto {
  return {
    ref: entry.ref,
    turn: turnNumber(entry),
    timestamp: entry.timestamp,
    summary: `copilot_message: ${truncate(textOf(entry.content), 220)}`,
  };
}

function genericEvidence(entry: NormalizedTraceEntry): DiagnoseEvidenceDto {
  return {
    ref: entry.ref,
    turn: turnNumber(entry),
    timestamp: entry.timestamp,
    summary: `${entry.type}: ${truncate(JSON.stringify(entry.content), 220)}`,
  };
}

function turnNumber(entry: NormalizedTraceEntry): number | undefined {
  const content = entry.content as { turn?: unknown } | undefined;
  if (typeof content?.turn === 'number') return content.turn;
  const match = entry.turnRef?.match(/baseline:(\d+)/);
  return match ? undefined : undefined;
}

function pattern(input: DiagnosePatternDto): DiagnosePatternDto {
  return { ...input, confidence: Math.max(0, Math.min(1, input.confidence)) };
}

function score(pattern: DiagnosePatternDto): number {
  const severity = { critical: 4, high: 3, medium: 2, low: 1 }[pattern.severity];
  return severity * 10 + pattern.confidence;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? '');
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)]),
  );
}
