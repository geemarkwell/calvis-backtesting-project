import { baseToolName } from '../../copilot-simulation/output-comparison';
import type { DiagnosticInput } from './diagnostic-input';

export interface TheoCaseProfile {
  targetIssue: string;
  expectedBehavior: string;
  windows: Array<{ jobId: string; startTurn: number; endTurn: number }>;
  turns: Array<{
    ref: string;
    turn?: number;
    ts?: string;
    trigger?: string;
    instruction?: string;
  }>;
  messages: Array<{
    ref: string;
    ts?: string;
    role: 'guard' | 'copilot';
    text: string;
    turnRef?: string;
  }>;
  toolActivity: Array<{ tool: string; count: number; failures: number; refs: string[] }>;
  importantActions: Array<{
    ref: string;
    ts?: string;
    tool: string;
    turnRef?: string;
    summary: string;
  }>;
  failedTools: Array<{ ref: string; tool: string; error: string }>;
  promptRoutesSeen: string[];
  evidenceRefs: string[];
}

const IMPORTANT_ACTIONS = new Set([
  'add_copilot_note',
  'create_copilot_alert',
  'create_copilot_task',
  'create_feature_request',
  'escalate_to_human',
  'escalate_to_ops',
  'flag_copilot_guard',
  'request_copilot_dm',
]);

export function buildTheoCaseProfile(input: DiagnosticInput): TheoCaseProfile {
  const trace = input.badResponses.flatMap((window) => window.trace);
  const toolMap = new Map<string, { tool: string; count: number; failures: number; refs: string[] }>();
  const importantActions: TheoCaseProfile['importantActions'] = [];
  const failedTools: TheoCaseProfile['failedTools'] = [];
  const promptRoutesSeen = new Set<string>();
  const evidenceRefs = new Set<string>();

  const turns = trace
    .filter((entry) => entry.type === 'turn_start')
    .map((entry) => {
      if (entry.instructionFile) promptRoutesSeen.add(entry.instructionFile);
      evidenceRefs.add(entry.ref);
      return {
        ref: entry.ref,
        turn: turnNumber(entry.content),
        ts: entry.timestamp,
        trigger: entry.trigger,
        instruction: entry.instructionFile,
      };
    });

  const messages = trace
    .filter((entry) => entry.type === 'guard_message' || entry.type === 'copilot_message')
    .map((entry) => {
      evidenceRefs.add(entry.ref);
      return {
        ref: entry.ref,
        ts: entry.timestamp,
        role: entry.type === 'guard_message' ? 'guard' as const : 'copilot' as const,
        text: truncate(textOf(entry.content), 500),
        turnRef: entry.turnRef,
      };
    });

  for (const entry of trace.filter((item) => item.type === 'tool_call')) {
    const content = isRecord(entry.content) ? entry.content : {};
    const tool = baseToolName(String(content.tool ?? 'unknown'));
    const current = toolMap.get(tool) ?? { tool, count: 0, failures: 0, refs: [] };
    current.count += 1;
    current.refs.push(entry.ref);
    const error = typeof content.error === 'string' ? content.error : undefined;
    const ok = typeof content.ok === 'boolean' ? content.ok : undefined;
    if (ok === false || error) {
      current.failures += 1;
      failedTools.push({ ref: entry.ref, tool, error: error ?? 'Tool call failed.' });
    }
    if (IMPORTANT_ACTIONS.has(tool)) {
      evidenceRefs.add(entry.ref);
      importantActions.push({
        ref: entry.ref,
        ts: entry.timestamp,
        tool,
        turnRef: entry.turnRef,
        summary: truncate(actionSummary(content), 500),
      });
    }
    toolMap.set(tool, current);
  }

  return {
    targetIssue: input.whatWentWrong,
    expectedBehavior: input.expectedBehavior,
    windows: input.badResponses.map((window) => ({
      jobId: window.jobId,
      startTurn: window.startTurn,
      endTurn: window.endTurn,
    })),
    turns,
    messages,
    toolActivity: [...toolMap.values()].sort((left, right) => right.count - left.count),
    importantActions,
    failedTools,
    promptRoutesSeen: [...promptRoutesSeen].sort(),
    evidenceRefs: [...evidenceRefs].sort(),
  };
}

export function renderTheoCaseBrief(profile: TheoCaseProfile): string {
  return [
    'CASE PROFILE',
    '',
    'TARGET ISSUE',
    profile.targetIssue,
    '',
    'EXPECTED BEHAVIOR',
    profile.expectedBehavior,
    '',
    'WINDOWS',
    ...profile.windows.map((window) => `- Job ${window.jobId}, turns ${window.startTurn}-${window.endTurn}.`),
    '',
    'PROMPT ROUTES SEEN',
    ...(profile.promptRoutesSeen.length ? profile.promptRoutesSeen.map((route) => `- ${route}`) : ['- None recorded.']),
    '',
    'TURNS',
    ...(profile.turns.length
      ? profile.turns.map((turn) => `- ${turn.ref}: turn ${turn.turn ?? 'unknown'}, trigger ${turn.trigger ?? 'unknown'}, instruction ${turn.instruction ?? 'unknown'}, at ${turn.ts ?? 'unknown'}.`)
      : ['- None recorded.']),
    '',
    'MESSAGES',
    ...(profile.messages.length
      ? profile.messages.map((message) => `- ${message.ref}: ${message.role.toUpperCase()} said ${JSON.stringify(message.text)}${message.turnRef ? ` (${message.turnRef})` : ''}.`)
      : ['- None recorded.']),
    '',
    'TOOL ACTIVITY',
    ...(profile.toolActivity.length
      ? profile.toolActivity.map((tool) => `- ${tool.tool}: ${tool.count} call(s), ${tool.failures} failure(s). Refs: ${tool.refs.join(', ')}.`)
      : ['- None recorded.']),
    '',
    'IMPORTANT ACTIONS',
    ...(profile.importantActions.length
      ? profile.importantActions.map((action) => `- ${action.ref}: ${action.tool}. ${action.summary}`)
      : ['- None recorded.']),
    '',
    'FAILED TOOLS',
    ...(profile.failedTools.length
      ? profile.failedTools.map((tool) => `- ${tool.ref}: ${tool.tool} failed: ${tool.error}`)
      : ['- None recorded.']),
    '',
    'EVIDENCE REFS',
    profile.evidenceRefs.join(', ') || 'None recorded.',
  ].join('\n');
}

function actionSummary(content: Record<string, unknown>): string {
  const input = isRecord(content.input) ? content.input : {};
  const values = ['body', 'details', 'blocker_summary', 'summary', 'content']
    .map((key) => input[key])
    .filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
  return values.join(' / ') || JSON.stringify(content);
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.text === 'string') return value.text;
  return JSON.stringify(value ?? null);
}

function turnNumber(value: unknown): number | undefined {
  return isRecord(value) && typeof value.turn === 'number' ? value.turn : undefined;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
