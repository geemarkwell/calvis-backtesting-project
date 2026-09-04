import { normalizeTrace } from '../mastra/theo/trace-normalizer';
import type {
  CopilotSimulationAction,
  CopilotOutputSnapshot,
  ShiftBundle,
} from './copilot-simulation.types';

export const RELEVANT_ACTION_NAMES = new Set([
  'request_copilot_dm',
  'add_copilot_note',
  'create_copilot_task',
  'flag_copilot_guard',
  'escalate_to_human',
  'escalate_to_ops',
]);

export function baseToolName(tool: string): string {
  return tool.split('__').at(-1) ?? tool;
}

export function normalizeCopilotOutput(
  actions: CopilotSimulationAction[],
  fallbackMessages: string[] = [],
): CopilotOutputSnapshot {
  const relevantActions = actions
    .map((action) => ({
      tool: baseToolName(action.tool),
      input: action.input,
    }))
    .filter((action) => RELEVANT_ACTION_NAMES.has(action.tool));
  const requestedMessages = relevantActions
    .filter((action) => action.tool === 'request_copilot_dm')
    .map((action) => action.input.body)
    .filter((body): body is string => typeof body === 'string');
  const messages = uniqueNormalizedText(
    requestedMessages.length > 0 ? requestedMessages : fallbackMessages,
  );
  const nonMessageActions = relevantActions.filter(
    (action) => action.tool !== 'request_copilot_dm',
  );

  return {
    messages,
    actions: nonMessageActions,
    silent: messages.length === 0 && nonMessageActions.length === 0,
  };
}

export function buildHistoricalCopilotOutputs(
  bundle: ShiftBundle,
): Map<number, CopilotOutputSnapshot> {
  const trace = normalizeTrace(bundle);
  const outputs = new Map<number, CopilotOutputSnapshot>();

  for (const turnEntry of trace.filter(
    (entry) => entry.source === 'baseline' && entry.type === 'turn_start',
  )) {
    const turn = extractTurnNumber(turnEntry.content);
    if (turn === undefined) {
      continue;
    }

    const relatedEntries = trace.filter(
      (entry) => entry.source === 'baseline' && entry.turnRef === turnEntry.ref,
    );
    const actions = relatedEntries
      .filter((entry) => entry.type === 'tool_call')
      .map((entry) => extractAction(entry.content))
      .filter((action): action is CopilotSimulationAction => Boolean(action));
    const messages = relatedEntries
      .filter((entry) => entry.type === 'copilot_message')
      .map((entry) => entry.content)
      .filter((content): content is string => typeof content === 'string');

    outputs.set(turn, normalizeCopilotOutput(actions, messages));
  }

  return outputs;
}

export function copilotOutputsEqual(
  left: CopilotOutputSnapshot,
  right: CopilotOutputSnapshot,
): boolean {
  return stableStringify(left) === stableStringify(right);
}

function extractTurnNumber(content: unknown): number | undefined {
  if (!content || typeof content !== 'object' || !('turn' in content)) {
    return undefined;
  }
  return typeof content.turn === 'number' ? content.turn : undefined;
}

function extractAction(content: unknown): CopilotSimulationAction | undefined {
  if (
    !content ||
    typeof content !== 'object' ||
    !('tool' in content) ||
    !('input' in content) ||
    typeof content.tool !== 'string' ||
    !content.input ||
    typeof content.input !== 'object' ||
    Array.isArray(content.input)
  ) {
    return undefined;
  }

  return {
    tool: content.tool,
    input: content.input as Record<string, unknown>,
  };
}

function uniqueNormalizedText(values: string[]): string[] {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)]),
  );
}
