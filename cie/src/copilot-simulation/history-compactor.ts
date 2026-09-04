import type { RecordedReplayToolCall } from '../mastra/copilot/types';
import { baseToolName } from './output-comparison';
import type { ShiftBundle } from './copilot-simulation.types';
import { buildRecordedReplayToolCalls } from './episode-builder';

const CHAT_HISTORY_LIMIT = 20;
const RELEVANT_LOG_PATTERN =
  /patrol|check.?in|clock|incident|damage|theft|intruder|escalat|assign|remove|confirm|uniform/i;
const REDUNDANT_READ_PATHS = [
  'context/job.json',
  'context/guards',
  'workspace/analysis.md',
];
const LOCATION_GUARD_KEYS = [
  'guard_id',
  'guard_name',
  'on_site',
  'status',
  'assigned_location',
  'assigned_post',
  'current_distance_from_site_meters',
  'geofence_type',
  'geo_fence_radius_meters',
  'last_ping_accuracy_meters',
  'last_ping_at',
  'last_ping_at_local',
  'last_ping_age_seconds',
  'stale_ping_duration_minutes',
  'ping_count',
  'moved_distance_meters',
  'is_stationary',
  'off_site_duration_minutes',
  'off_site_max_distance_meters',
  'last_geofence_event',
] as const;

export interface HistoricalReplayState {
  toolCalls: RecordedReplayToolCall[];
  workspace: Record<string, string>;
  retainedChatKeys: Set<string>;
}

export function buildHistoricalReplayState(
  bundle: ShiftBundle,
  beforeTurn: number,
  assignedGuardId: string | number,
): HistoricalReplayState {
  const historicalCalls = buildRecordedReplayToolCalls(bundle).filter(
    (call) => call.turn < beforeTurn,
  );
  const workspace = latestWorkspaceFiles(historicalCalls);
  const latestLocationCall = historicalCalls.findLast(
    (call) => baseToolName(call.tool) === 'get_guard_locations',
  );
  const latestJobLogsCall = historicalCalls.findLast(
    (call) => baseToolName(call.tool) === 'get_job_logs',
  );
  const toolCalls = historicalCalls.flatMap((call) => {
    const toolName = baseToolName(call.tool);

    if (
      toolName === 'Write' ||
      toolName === 'get_job_chat_messages' ||
      toolName === 'get_copilot_message_history'
    ) {
      return [];
    }
    if (toolName === 'Read' && isRedundantRead(call.input.file_path)) {
      return [];
    }
    if (toolName === 'get_guard_locations') {
      return call === latestLocationCall
        ? [
            {
              ...call,
              output: compactLocationOutput(
                call.output,
                bundle,
                assignedGuardId,
              ),
            },
          ]
        : [];
    }
    if (toolName === 'get_job_logs') {
      return call === latestJobLogsCall
        ? [{ ...call, output: compactJobLogsOutput(call.output) }]
        : [];
    }
    return [call];
  });

  return {
    toolCalls,
    workspace,
    retainedChatKeys: retainedChatKeys(bundle, beforeTurn),
  };
}

export function historyChatKey(
  role: 'guard' | 'copilot',
  timestamp: string,
  content: string,
): string {
  return `${role}\u0000${timestamp}\u0000${content}`;
}

function retainedChatKeys(
  bundle: ShiftBundle,
  beforeTurn: number,
): Set<string> {
  const turnTimestamp = bundle.baseline.find(
    (entry) => entry.type === 'turn_start' && entry.turn === beforeTurn,
  )?.ts;
  const messages = [
    ...bundle.events.flatMap((event) => {
      if (
        event.type !== 'guard_message' ||
        !turnTimestamp ||
        event.ts >= turnTimestamp
      ) {
        return [];
      }
      const content =
        event.text?.trim() ||
        event.audio_transcription?.trim() ||
        (typeof event.image === 'string' ? event.image.trim() : '');
      return content ? [{ role: 'guard' as const, ts: event.ts, content }] : [];
    }),
    ...bundle.baseline.flatMap((entry) =>
      entry.type === 'copilot_message' &&
      entry.text?.trim() &&
      turnTimestamp &&
      entry.ts < turnTimestamp
        ? [{ role: 'copilot' as const, ts: entry.ts, content: entry.text }]
        : [],
    ),
  ]
    .sort((left, right) => left.ts.localeCompare(right.ts))
    .slice(-CHAT_HISTORY_LIMIT);

  return new Set(
    messages.map((message) =>
      historyChatKey(message.role, message.ts, message.content),
    ),
  );
}

function latestWorkspaceFiles(
  calls: RecordedReplayToolCall[],
): Record<string, string> {
  const workspace: Record<string, string> = {};
  for (const call of calls) {
    if (baseToolName(call.tool) !== 'Write') {
      continue;
    }
    const filePath = call.input.file_path;
    const content = call.input.content;
    if (typeof filePath === 'string' && typeof content === 'string') {
      workspace[filePath] = content;
    }
  }
  return workspace;
}

function compactLocationOutput(
  output: unknown,
  bundle: ShiftBundle,
  assignedGuardId: string | number,
): unknown {
  const parsed = parseObject(output);
  if (!parsed) {
    return unavailable('Recorded location result could not be parsed.');
  }

  const guards = Array.isArray(parsed.guards)
    ? parsed.guards.filter(isRecord)
    : [];
  const assignedGuards = guards.filter(
    (guard) => String(guard.guard_id) === String(assignedGuardId),
  );
  const selectedGuards =
    assignedGuards.length > 0 ? assignedGuards : guards.slice(0, 1);

  if (selectedGuards.length === 0) {
    return unavailable('Recorded result contains no assigned guard location.');
  }

  return {
    source: 'recorded_history_compacted',
    timezone: bundle.shift.timezone,
    guards: selectedGuards.map((guard) => pick(guard, LOCATION_GUARD_KEYS)),
  };
}

function compactJobLogsOutput(output: unknown): unknown {
  const parsed = parseObject(output);
  const logs =
    parsed && Array.isArray(parsed.logs) ? parsed.logs.filter(isRecord) : [];
  const relevantLogs = logs
    .filter((log) => RELEVANT_LOG_PATTERN.test(JSON.stringify(log)))
    .slice(-20)
    .map((log) =>
      pick(log, [
        'id',
        'job',
        'guard',
        'guard_name',
        'category',
        'notes',
        'date_created',
        'date_created_local',
      ] as const),
    );

  return relevantLogs.length > 0
    ? {
        source: 'recorded_history_compacted',
        logs: relevantLogs,
        count: relevantLogs.length,
      }
    : unavailable('Recorded result contains no relevant job logs.');
}

function parseObject(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function pick<const TKeys extends readonly string[]>(
  value: Record<string, unknown>,
  keys: TKeys,
): Record<string, unknown> {
  return Object.fromEntries(
    keys.flatMap((key) => (key in value ? [[key, value[key]]] : [])),
  );
}

function isRedundantRead(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    REDUNDANT_READ_PATHS.some(
      (path) => value === path || value.startsWith(`${path}/`),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unavailable(reason: string): Record<string, unknown> {
  return { status: 'unavailable_in_replay', reason };
}
