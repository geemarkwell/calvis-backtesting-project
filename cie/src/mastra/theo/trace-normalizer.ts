import { instructionFileForTrigger } from '../copilot/turn-builder';
import type {
  BaselineEntry,
  CopilotSimulationLog,
  ShiftBundle,
  ShiftEvent,
} from '../../copilot-simulation/copilot-simulation.types';

export interface NormalizedTraceEntry {
  ref: string;
  source: 'events' | 'baseline';
  sourceIndex: number;
  timestamp: string;
  type: string;
  content: unknown;
  turnRef?: string;
  trigger?: string;
  instructionFile?: string;
  silent?: boolean;
}

export interface NormalizeTraceOptions {
  includeRawTelemetry?: boolean;
}

export interface SelectTraceWindowInput {
  jobId: string;
  startTurn: number;
  endTurn: number;
  simTarget?: number;
}

const RAW_EVENT_TYPES = new Set(['location', 'telemetry']);
const RELEVANT_ACTIONS = new Set([
  'add_copilot_note',
  'create_copilot_task',
  'escalate_to_human',
  'escalate_to_ops',
  'flag_copilot_guard',
  'request_copilot_dm',
]);
const RAW_ARRAY_KEYS = new Set([
  'coordinates',
  'heartbeat_trend',
  'locations',
  'pings',
  'telemetry',
]);

interface IndexedTurn {
  ref: string;
  sourceIndex: number;
  timestamp: string;
  trigger: string;
}

interface IndexedBaseline {
  entry: BaselineEntry;
  sourceIndex: number;
  ref: string;
}

/**
 * Build Theo's chronological evidence view. References always use original
 * array indexes, so filtering and sorting cannot change a citation.
 */
export function normalizeTrace(
  bundle: ShiftBundle,
  options: NormalizeTraceOptions = {},
): NormalizedTraceEntry[] {
  const indexedBaseline: IndexedBaseline[] = bundle.baseline.map(
    (entry, sourceIndex) => ({
      entry,
      sourceIndex,
      ref: `baseline:${sourceIndex}`,
    }),
  );
  const turns = indexedBaseline
    .filter(
      ({ entry }) =>
        entry.type === 'turn_start' &&
        typeof entry.trigger === 'string' &&
        entry.trigger.length > 0,
    )
    .map(({ entry, sourceIndex, ref }): IndexedTurn => ({
      ref,
      sourceIndex,
      timestamp: entry.ts,
      trigger: entry.trigger!,
    }));
  const turnByBaselineIndex = new Map<number, IndexedTurn>();

  for (const item of indexedBaseline) {
    if (item.entry.type === 'turn_start') {
      const ownTurn = turns.find(
        (turn) => turn.sourceIndex === item.sourceIndex,
      );
      if (ownTurn) {
        turnByBaselineIndex.set(item.sourceIndex, ownTurn);
      }
      continue;
    }

    if (item.entry.type === 'tool_call') {
      const turn = nearestTurn(turns, item.entry.ts, item.entry.trigger);
      if (turn) {
        turnByBaselineIndex.set(item.sourceIndex, turn);
      }
    }
  }

  associateCopilotMessages(indexedBaseline, turns, turnByBaselineIndex);

  const eventEntries = bundle.events
    .map((event, sourceIndex) => ({ event, sourceIndex }))
    .filter(
      ({ event }) =>
        options.includeRawTelemetry || !RAW_EVENT_TYPES.has(event.type),
    )
    .map(({ event, sourceIndex }) => {
      const turn =
        event.type === 'guard_message'
          ? followingGuardMessageTurn(turns, event.ts)
          : undefined;
      return normalizeEvent(event, sourceIndex, turn);
    });

  const relevantTurns = new Set<string>();
  for (const item of indexedBaseline) {
    const turn = turnByBaselineIndex.get(item.sourceIndex);
    if (!turn) {
      continue;
    }
    if (
      item.entry.type === 'copilot_message' ||
      (item.entry.type === 'tool_call' &&
        RELEVANT_ACTIONS.has(baseToolName(item.entry.tool)))
    ) {
      relevantTurns.add(turn.ref);
    }
  }

  const baselineEntries = indexedBaseline.map((item) => {
    const turn = turnByBaselineIndex.get(item.sourceIndex);
    return normalizeBaselineEntry(
      item.entry,
      item.sourceIndex,
      turn,
      item.entry.type === 'turn_start'
        ? !relevantTurns.has(item.ref)
        : undefined,
    );
  });

  return [...eventEntries, ...baselineEntries].sort(compareTraceEntries);
}

/**
 * Rebuild Theo's evidence view from a persisted Copilot simulation. The saved
 * new Copilot output is the response under diagnosis; original output is not
 * substituted for it. Guard reply provenance remains explicit.
 */
export function normalizeSimulationTrace(
  simulation: CopilotSimulationLog,
  options: NormalizeTraceOptions = {},
): NormalizedTraceEntry[] {
  const events: ShiftEvent[] = simulation.turns.flatMap((turn) => [
    ...turn.events.filter((event) => event.type !== 'guard_message'),
    ...turn.guardMessages.flatMap((message) =>
      message.reply === null
        ? []
        : [
            {
              ts: turn.timestamp,
              type: 'guard_message',
              text: message.reply,
              replySource: message.source,
              historicalReply: message.historicalReply,
            },
          ],
    ),
  ]);
  const baseline: BaselineEntry[] = simulation.turns.flatMap((turn) => [
    {
      ts: turn.timestamp,
      type: 'turn_start',
      turn: turn.turn,
      trigger: turn.trigger,
    },
    ...turn.newCopilot.messages.map((text) => ({
      ts: turn.timestamp,
      type: 'copilot_message',
      text,
      trigger: turn.trigger,
    })),
    ...turn.newCopilot.actions.map((action) => ({
      ts: turn.timestamp,
      type: 'tool_call',
      tool: action.tool,
      input: action.input,
      trigger: turn.trigger,
    })),
  ]);
  const turns = new Map(simulation.turns.map((turn) => [turn.turn, turn]));

  return normalizeTrace(
    { shift: simulation.context, events, baseline },
    options,
  ).map((entry) => {
    const number = turnNumber(entry);
    const turn = number === undefined ? undefined : turns.get(number);
    if (entry.type !== 'turn_start' || !turn) {
      return entry;
    }
    return {
      ...entry,
      content: {
        turn: turn.turn,
        simulationNumber: simulation.simulationNumber,
        replayMode: simulation.replayMode,
        model: simulation.modelConfiguration.model,
        skipped: turn.newCopilot.skipped,
        stopReason: turn.newCopilot.stopReason,
      },
      silent: turn.newCopilot.silent,
    };
  });
}

/**
 * Selects only entries belonging to user-requested turns and qualifies every
 * citation with its job ID so multiple shift fixtures cannot collide.
 */
export function selectTraceWindow(
  trace: readonly NormalizedTraceEntry[],
  { jobId, startTurn, endTurn, simTarget }: SelectTraceWindowInput,
): NormalizedTraceEntry[] {
  if (!/^\d+$/.test(jobId)) {
    throw new Error(`Job ID must contain only digits: ${jobId}.`);
  }
  if (!Number.isInteger(startTurn) || startTurn < 1) {
    throw new Error('startTurn must be a positive integer.');
  }
  if (!Number.isInteger(endTurn) || endTurn < 1) {
    throw new Error('endTurn must be a positive integer.');
  }
  if (startTurn > endTurn) {
    throw new Error('startTurn cannot be greater than endTurn.');
  }

  const turnsByNumber = new Map<number, string>();
  for (const entry of trace) {
    const turn = turnNumber(entry);
    if (entry.type === 'turn_start' && turn !== undefined) {
      turnsByNumber.set(turn, entry.ref);
    }
  }

  if (!turnsByNumber.has(startTurn)) {
    throw new Error(`Job ${jobId} does not contain startTurn ${startTurn}.`);
  }
  if (!turnsByNumber.has(endTurn)) {
    throw new Error(`Job ${jobId} does not contain endTurn ${endTurn}.`);
  }

  const selectedTurnRefs = new Set(
    [...turnsByNumber.entries()]
      .filter(([turn]) => turn >= startTurn && turn <= endTurn)
      .map(([, ref]) => ref),
  );

  return trace
    .filter(
      (entry) =>
        selectedTurnRefs.has(entry.ref) ||
        (entry.turnRef !== undefined && selectedTurnRefs.has(entry.turnRef)),
    )
    .map((entry) => ({
      ...entry,
      ref: qualifyTraceReference(jobId, entry.ref, simTarget),
      ...(entry.turnRef
        ? { turnRef: qualifyTraceReference(jobId, entry.turnRef, simTarget) }
        : {}),
    }));
}

function turnNumber(entry: NormalizedTraceEntry): number | undefined {
  if (
    typeof entry.content !== 'object' ||
    entry.content === null ||
    !('turn' in entry.content) ||
    typeof entry.content.turn !== 'number'
  ) {
    return undefined;
  }
  return entry.content.turn;
}

function qualifyTraceReference(
  jobId: string,
  reference: string,
  simTarget?: number,
): string {
  const simulation = simTarget ? `simulation:${simTarget}:` : '';
  return `job:${jobId}:${simulation}${reference}`;
}

function normalizeEvent(
  event: ShiftEvent,
  sourceIndex: number,
  turn?: IndexedTurn,
): NormalizedTraceEntry {
  const result: NormalizedTraceEntry = {
    ref: `events:${sourceIndex}`,
    source: 'events',
    sourceIndex,
    timestamp: event.ts,
    type: event.type,
    content: eventContent(event),
  };
  if (turn) {
    result.turnRef = turn.ref;
    result.trigger = turn.trigger;
    result.instructionFile = instructionPath(turn.trigger);
  }
  return result;
}

function normalizeBaselineEntry(
  entry: BaselineEntry,
  sourceIndex: number,
  turn: IndexedTurn | undefined,
  silent: boolean | undefined,
): NormalizedTraceEntry {
  const trigger =
    entry.type === 'turn_start'
      ? entry.trigger
      : (entry.trigger ?? turn?.trigger);
  const result: NormalizedTraceEntry = {
    ref: `baseline:${sourceIndex}`,
    source: 'baseline',
    sourceIndex,
    timestamp: entry.ts,
    type: entry.type,
    content: baselineContent(entry),
  };

  if (turn) {
    result.turnRef = turn.ref;
  }
  if (trigger) {
    result.trigger = trigger;
    result.instructionFile = instructionPath(trigger);
  }
  if (silent !== undefined) {
    result.silent = silent;
  }
  return result;
}

function eventContent(event: ShiftEvent): unknown {
  if (event.type === 'guard_message') {
    const text =
      event.text?.trim() || event.audio_transcription?.trim() || event.image;
    return event.replySource === 'historical' ||
      event.replySource === 'simulated'
      ? {
          text,
          replySource: event.replySource,
          historicalReply: event.historicalReply ?? null,
        }
      : text;
  }
  if (event.type === 'job_log') {
    return { category: event.category, notes: event.notes ?? null };
  }
  return withoutKeys(event, ['ts', 'type']);
}

function baselineContent(entry: BaselineEntry): unknown {
  if (entry.type === 'copilot_message') {
    return entry.text ?? null;
  }
  if (entry.type === 'turn_start') {
    return { turn: entry.turn ?? null };
  }
  if (entry.type === 'tool_call') {
    const baseName = baseToolName(entry.tool);
    const locationLike = isLocationOrTelemetryTool(entry.tool);
    if (baseName === 'Write') {
      const content = entry.input?.content;
      return {
        tool: entry.tool ?? null,
        input: {
          ...entry.input,
          ...(typeof content === 'string'
            ? {
                content: {
                  omitted: 'internal workspace file contents',
                  characterCount: content.length,
                },
              }
            : {}),
        },
        output: entry.output ?? null,
        ok: entry.ok ?? null,
        error: entry.error ?? null,
      };
    }
    if (
      baseName === 'Read' &&
      typeof entry.output === 'string' &&
      entry.output.length > 1_000
    ) {
      return {
        tool: entry.tool ?? null,
        input: entry.input ?? {},
        output: {
          omitted: 'internal workspace file contents',
          characterCount: entry.output.length,
        },
        ok: entry.ok ?? null,
        error: entry.error ?? null,
      };
    }
    return {
      tool: entry.tool ?? null,
      input: locationLike
        ? compactRawTelemetry(entry.input ?? {})
        : (entry.input ?? {}),
      output: locationLike
        ? compactToolOutput(entry.output)
        : (entry.output ?? null),
      ok: entry.ok ?? null,
      error: entry.error ?? null,
    };
  }
  return withoutKeys(entry, ['ts', 'type', 'trigger']);
}

function associateCopilotMessages(
  baseline: IndexedBaseline[],
  turns: IndexedTurn[],
  turnByBaselineIndex: Map<number, IndexedTurn>,
): void {
  const requests = baseline.filter(
    ({ entry }) =>
      entry.type === 'tool_call' &&
      baseToolName(entry.tool) === 'request_copilot_dm' &&
      typeof entry.input?.body === 'string',
  );
  const usedRequests = new Set<number>();

  for (const message of baseline.filter(
    ({ entry }) => entry.type === 'copilot_message',
  )) {
    const text = message.entry.text;
    const candidates = requests.filter(
      (request) =>
        !usedRequests.has(request.sourceIndex) &&
        request.entry.input?.body === text,
    );
    const matchedRequest = nearestBaselineEntry(candidates, message.entry.ts);
    const requestTurn = matchedRequest
      ? turnByBaselineIndex.get(matchedRequest.sourceIndex)
      : undefined;
    const turn = requestTurn ?? nearestTurn(turns, message.entry.ts, undefined);

    if (matchedRequest) {
      usedRequests.add(matchedRequest.sourceIndex);
    }
    if (turn) {
      turnByBaselineIndex.set(message.sourceIndex, turn);
    }
  }
}

function nearestTurn(
  turns: IndexedTurn[],
  timestamp: string,
  trigger: string | undefined,
): IndexedTurn | undefined {
  const matching = trigger
    ? turns.filter((turn) => turn.trigger === trigger)
    : turns;
  return matching.reduce<IndexedTurn | undefined>((nearest, turn) => {
    if (!nearest) {
      return turn;
    }
    return timestampDistance(turn.timestamp, timestamp) <
      timestampDistance(nearest.timestamp, timestamp)
      ? turn
      : nearest;
  }, undefined);
}

function followingGuardMessageTurn(
  turns: IndexedTurn[],
  timestamp: string,
): IndexedTurn | undefined {
  return turns
    .filter(
      (turn) =>
        turn.trigger === 'guard_message' &&
        timestampDistance(turn.timestamp, timestamp, true) >= 0,
    )
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))[0];
}

function nearestBaselineEntry(
  entries: IndexedBaseline[],
  timestamp: string,
): IndexedBaseline | undefined {
  return entries.reduce<IndexedBaseline | undefined>((nearest, entry) => {
    if (!nearest) {
      return entry;
    }
    return timestampDistance(entry.entry.ts, timestamp) <
      timestampDistance(nearest.entry.ts, timestamp)
      ? entry
      : nearest;
  }, undefined);
}

function timestampDistance(
  timestamp: string,
  reference: string,
  signed = false,
): number {
  const distance = Date.parse(timestamp) - Date.parse(reference);
  if (!Number.isFinite(distance)) {
    return timestamp.localeCompare(reference);
  }
  return signed ? distance : Math.abs(distance);
}

function instructionPath(trigger: string): string {
  return `instructions/${instructionFileForTrigger(trigger)}`;
}

function baseToolName(tool: string | undefined): string {
  return tool?.split('__').at(-1) ?? '';
}

function isLocationOrTelemetryTool(tool: string | undefined): boolean {
  return /(location|telemetry|ping|heartbeat)/i.test(baseToolName(tool));
}

function compactToolOutput(output: unknown): unknown {
  if (typeof output !== 'string') {
    return compactRawTelemetry(output);
  }

  let parsed: unknown = output;
  for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt++) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return {
        omitted: 'unparseable raw location or telemetry output',
        characterCount: output.length,
      };
    }
  }
  return compactRawTelemetry(parsed);
}

function compactRawTelemetry(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    if (key && RAW_ARRAY_KEYS.has(key)) {
      return { omitted: true, count: value.length };
    }
    return value.map((item) => compactRawTelemetry(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      compactRawTelemetry(childValue, childKey),
    ]),
  );
}

function withoutKeys(value: object, keys: string[]): Record<string, unknown> {
  const excluded = new Set(keys);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !excluded.has(key),
    ),
  );
}

function compareTraceEntries(
  left: NormalizedTraceEntry,
  right: NormalizedTraceEntry,
): number {
  const byTimestamp = left.timestamp.localeCompare(right.timestamp);
  if (byTimestamp !== 0) {
    return byTimestamp;
  }
  if (left.source !== right.source) {
    return left.source === 'events' ? -1 : 1;
  }
  return left.sourceIndex - right.sourceIndex;
}
