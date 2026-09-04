import { createTool } from '@mastra/core/tools';
import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import type {
  CopilotRequestContext,
  RecordedReplayToolCall,
  ReplayToolResolution,
  ReplayToolTraceEntry,
} from './types';

type CopilotContext = RequestContext<CopilotRequestContext>;

const consumedReplayCalls = new WeakMap<object, Set<number>>();

const SIDE_EFFECT_TOOLS = new Set([
  'Write',
  'add_copilot_note',
  'create_copilot_alert',
  'create_copilot_task',
  'create_feature_request',
  'escalate_to_human',
  'escalate_to_ops',
  'flag_copilot_guard',
  'request_copilot_dm',
  'save_chat_image',
]);

function normalizeToolName(toolName: string): string {
  return toolName.replace(/^mcp__calvis__/, '');
}

function consumeReplayResult(
  toolName: string,
  input: Record<string, unknown>,
  requestContext?: RequestContext,
): unknown {
  if (!requestContext) {
    throw new Error(`Replay tool ${toolName} requires a request context.`);
  }

  const context = requestContext as CopilotContext;
  const calls = context.get('copilot-replay-tool-calls') ?? [];
  const canonicalName = normalizeToolName(toolName);
  const turn = context.get('copilot-active-turn');
  if (!turn) {
    throw new Error(`Replay tool ${canonicalName} requires an active turn.`);
  }

  const observedCalls = context.get('copilot-observed-tool-calls') ?? [];
  observedCalls.push({ tool: canonicalName, input });
  context.set('copilot-observed-tool-calls', observedCalls);

  const consumed = consumedReplayCalls.get(requestContext) ?? new Set<number>();
  const recordedIndex = calls.findIndex(
    (call, index) =>
      !consumed.has(index) &&
      call.turn === turn &&
      normalizeToolName(call.tool) === canonicalName &&
      stableStringify(call.input) === stableStringify(input),
  );
  const recordedCall = recordedIndex >= 0 ? calls[recordedIndex] : undefined;

  if (recordedCall) {
    consumed.add(recordedIndex);
    consumedReplayCalls.set(requestContext, consumed);

    if (recordedCall.ok === false || recordedCall.error) {
      const error =
        recordedCall.error ?? `Recorded tool call ${canonicalName} failed.`;
      traceTool(context, {
        turn,
        tool: canonicalName,
        input,
        resolution: 'recorded',
        matchedRecordedCall: {
          timestamp: recordedCall.timestamp,
          input: recordedCall.input,
        },
        error,
      });
      throw new Error(error);
    }

    traceTool(context, {
      turn,
      tool: canonicalName,
      input,
      resolution: 'recorded',
      matchedRecordedCall: {
        timestamp: recordedCall.timestamp,
        input: recordedCall.input,
      },
      result: recordedCall.output,
    });
    return recordedCall.output;
  }

  if (context.get('copilot-replay-mode') === 'original') {
    const candidates = calls
      .filter(
        (call) =>
          call.turn === turn && normalizeToolName(call.tool) === canonicalName,
      )
      .map((call) => call.input);
    const error = `No exact recorded result for turn ${turn}, tool ${canonicalName}, input ${stableStringify(input)}. Recorded inputs for this turn/tool: ${stableStringify(candidates)}.`;
    traceTool(context, {
      turn,
      tool: canonicalName,
      input,
      resolution: 'unavailable_in_replay',
      error,
    });
    throw new Error(error);
  }

  const fallback = SIDE_EFFECT_TOOLS.has(canonicalName)
    ? simulateSideEffect(canonicalName, input, context)
    : resolveReadOnlyFromReplay(canonicalName, input, context);
  traceTool(context, {
    turn,
    tool: canonicalName,
    input,
    resolution: fallback.resolution,
    result: fallback.result,
  });
  return fallback.result;
}

function traceTool(context: CopilotContext, entry: ReplayToolTraceEntry): void {
  const trace = context.get('copilot-tool-trace') ?? [];
  trace.push(entry);
  context.set('copilot-tool-trace', trace);
}

function simulateSideEffect(
  toolName: string,
  input: Record<string, unknown>,
  context: CopilotContext,
): { resolution: ReplayToolResolution; result: unknown } {
  if (toolName === 'Write') {
    const filePath = input.file_path;
    const content = input.content;
    if (typeof filePath === 'string' && typeof content === 'string') {
      const workspace = context.get('copilot-virtual-workspace');
      workspace[filePath] = content;
      context.set('copilot-virtual-workspace', workspace);
      return {
        resolution: 'simulated_side_effect',
        result: `Wrote ${content.length} chars to ${filePath} (replay only)`,
      };
    }
  }

  return {
    resolution: 'simulated_side_effect',
    result: {
      status: 'simulated_success',
      replay_only: true,
      tool: toolName,
    },
  };
}

function resolveReadOnlyFromReplay(
  toolName: string,
  input: Record<string, unknown>,
  context: CopilotContext,
): { resolution: ReplayToolResolution; result: unknown } {
  const evidence = context.get('copilot-replay-evidence');
  const through = context.get('copilot-active-timestamp');
  const after = typeof input.after === 'string' ? input.after : undefined;
  const limit = typeof input.limit === 'number' ? input.limit : 200;
  const events = evidence.events
    .filter((event) => !through || event.ts <= through)
    .filter((event) => !after || event.ts > after);

  if (toolName === 'Read') {
    const path = input.file_path;
    const content =
      typeof path === 'string'
        ? context.get('copilot-virtual-workspace')[path]
        : undefined;
    return content === undefined
      ? unavailable(toolName, 'File does not exist in replay workspace.')
      : { resolution: 'shift_data', result: content };
  }

  if (toolName === 'Glob') {
    const pattern = typeof input.pattern === 'string' ? input.pattern : '';
    const paths = Object.keys(context.get('copilot-virtual-workspace')).filter(
      (path) => globMatches(pattern, path),
    );
    return { resolution: 'shift_data', result: JSON.stringify(paths) };
  }

  if (toolName === 'Grep') {
    const pathPrefix = typeof input.path === 'string' ? input.path : '';
    const pattern = typeof input.pattern === 'string' ? input.pattern : '';
    const matches = Object.entries(
      context.get('copilot-virtual-workspace'),
    ).flatMap(([path, content]) =>
      path.startsWith(pathPrefix) && content.includes(pattern)
        ? [`${path}:${pattern}`]
        : [],
    );
    return { resolution: 'shift_data', result: matches.join('\n') };
  }

  if (toolName === 'get_guard_locations') {
    const locations = events.filter((event) => event.type === 'location');
    const telemetry = events.filter((event) => event.type === 'telemetry');
    if (locations.length === 0 && telemetry.length === 0) {
      return unavailable(
        toolName,
        'No location or telemetry events exist yet.',
      );
    }
    return {
      resolution: 'shift_data',
      result: {
        source: 'shift_events',
        locations: locations.slice(-limit),
        telemetry: input.include_pings ? telemetry.slice(-limit) : [],
      },
    };
  }

  if (toolName === 'get_job_logs') {
    const logs = events.filter((event) => event.type === 'job_log');
    return logs.length === 0
      ? unavailable(toolName, 'No job log events exist yet.')
      : { resolution: 'shift_data', result: { source: 'shift_events', logs } };
  }

  if (
    toolName === 'get_job_chat_messages' ||
    toolName === 'get_copilot_message_history'
  ) {
    const messages = [
      ...events
        .filter((event) => event.type === 'guard_message')
        .map((event) => ({ ...event, sender: 'guard' })),
      ...evidence.copilotMessages
        .filter((message) => !through || message.ts <= through)
        .filter((message) => !after || message.ts > after)
        .map((message) => ({ ...message, sender: 'copilot' })),
    ]
      .sort((left, right) => left.ts.localeCompare(right.ts))
      .slice(-limit);
    return messages.length === 0
      ? unavailable(toolName, 'No replay chat messages exist yet.')
      : {
          resolution: 'shift_data',
          result: { source: 'shift_events', messages, count: messages.length },
        };
  }

  if (toolName === 'get_site_history') {
    const shift = evidence.shift as Record<string, unknown>;
    const siteNotes = Array.isArray(shift.site_notes) ? shift.site_notes : [];
    const accountSummary = shift.account_summary ?? null;
    if (siteNotes.length === 0 && accountSummary === null) {
      return unavailable(toolName, 'Shift contains no site history.');
    }
    return {
      resolution: 'shift_data',
      result: {
        source: 'shift_context',
        site_notes: siteNotes,
        account_summary: accountSummary,
      },
    };
  }

  if (toolName === 'get_entity_summary') {
    const shift = evidence.shift as Record<string, unknown>;
    const entityType = input.entity_type;
    const value = entityType === 'guard' ? shift.guard : shift.account_summary;
    return value
      ? { resolution: 'shift_data', result: { source: 'shift_context', value } }
      : unavailable(
          toolName,
          `No ${String(entityType)} summary in shift data.`,
        );
  }

  if (toolName === 'get_guard_status') {
    const latestLog = events.filter((event) => event.type === 'job_log').at(-1);
    const latestLocation = events
      .filter((event) => event.type === 'location')
      .at(-1);
    return latestLog || latestLocation
      ? {
          resolution: 'shift_data',
          result: {
            source: 'shift_events',
            latest_job_log: latestLog ?? null,
            latest_location: latestLocation ?? null,
          },
        }
      : unavailable(toolName, 'No guard status evidence exists yet.');
  }

  if (toolName === 'get_job_incidents') {
    const incidents = events.filter(
      (event) =>
        event.type === 'job_log' &&
        /incident|damage|theft|intruder/i.test(JSON.stringify(event)),
    );
    return incidents.length > 0
      ? {
          resolution: 'shift_data',
          result: { source: 'shift_events', incidents },
        }
      : unavailable(toolName, 'No incident events exist yet.');
  }

  if (toolName === 'get_copilot_context') {
    const actions = context.get('copilot-observed-tool-calls') ?? [];
    return {
      resolution: 'shift_data',
      result: { source: 'replay_state', actions },
    };
  }

  return unavailable(toolName, 'No replay evidence adapter is available.');
}

function unavailable(
  toolName: string,
  reason: string,
): { resolution: 'unavailable_in_replay'; result: unknown } {
  return {
    resolution: 'unavailable_in_replay',
    result: { status: 'unavailable_in_replay', tool: toolName, reason },
  };
}

function globMatches(pattern: string, path: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const expression = escaped.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
  return new RegExp(`^${expression}$`).test(path);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function createReplayTool<TSchema extends z.ZodTypeAny>(
  id: string,
  description: string,
  inputSchema: TSchema,
) {
  return createTool({
    id,
    description,
    inputSchema,
    execute: (input, context) =>
      Promise.resolve(
        consumeReplayResult(
          id,
          input as Record<string, unknown>,
          context?.requestContext,
        ),
      ),
  });
}

const identifier = z.union([z.string(), z.number()]);
const sessionId = z.string().describe('Copilot session id');
const jobId = identifier.describe('Job id');
const guardId = identifier.describe('Guard id');

const globTool = createReplayTool(
  'Glob',
  'List replay workspace files matching a glob pattern.',
  z.object({ pattern: z.string() }),
);

const grepTool = createReplayTool(
  'Grep',
  'Search replay workspace files for a text pattern.',
  z.object({ path: z.string(), pattern: z.string() }),
);

const readTool = createReplayTool(
  'Read',
  'Read a file from the replay workspace.',
  z.object({
    file_path: z.string(),
    limit: z.number().int().positive().optional(),
  }),
);

const writeTool = createReplayTool(
  'Write',
  'Replay a historical workspace write without changing the real filesystem.',
  z.object({ file_path: z.string(), content: z.string() }),
);

const addCopilotNote = createReplayTool(
  'add_copilot_note',
  'Add a durable internal note about a guard, account, or site.',
  z.object({
    session_id: sessionId,
    note_text: z.string(),
    entity_type: z.string().optional(),
    entity_id: identifier.optional(),
    guard_id: guardId.optional(),
  }),
);

const createCopilotAlert = createReplayTool(
  'create_copilot_alert',
  'Create a replay-only operational alert.',
  z
    .object({
      session_id: sessionId,
      summary: z.string().optional(),
      details: z.string().optional(),
      severity: z.string().optional(),
    })
    .catchall(z.unknown()),
);

const createCopilotTask = createReplayTool(
  'create_copilot_task',
  'Create a replay-only Copilot task.',
  z
    .object({
      session_id: sessionId,
      title: z.string().optional(),
      details: z.string().optional(),
    })
    .catchall(z.unknown()),
);

const createFeatureRequest = createReplayTool(
  'create_feature_request',
  'Record a replay-only feature request.',
  z
    .object({
      session_id: sessionId,
      title: z.string().optional(),
      description: z.string().optional(),
    })
    .catchall(z.unknown()),
);

const escalateToHuman = createReplayTool(
  'escalate_to_human',
  'Escalate a time-critical issue that requires immediate human action.',
  z.object({
    session_id: sessionId,
    guard_id: guardId.optional(),
    summary: z.string(),
    details: z.string(),
    severity: z.string(),
  }),
);

const escalateToOps = createReplayTool(
  'escalate_to_ops',
  'Escalate a non-immediate operational blocker.',
  z.object({
    session_id: sessionId,
    guard_id: guardId.optional(),
    blocker_summary: z.string(),
    details: z.string(),
    urgency: z.string(),
  }),
);

const fetchChatImage = createReplayTool(
  'fetch_chat_image',
  'Fetch an image attached to a guard chat message.',
  z.object({ image_url: z.string(), max_dimension: z.number().optional() }),
);

const flagCopilotGuard = createReplayTool(
  'flag_copilot_guard',
  'Flag specific guard behavior for later review.',
  z.object({
    session_id: sessionId,
    guard_id: guardId,
    category: z.string(),
    reason: z.string(),
    severity: z.string(),
  }),
);

const getCopilotContext = createReplayTool(
  'get_copilot_context',
  'Get current pending tasks, DM requests, operator messages, and guard responses.',
  z.object({ session_id: sessionId }),
);

const getCopilotMessageHistory = createReplayTool(
  'get_copilot_message_history',
  'Get Copilot message history for a guard on a job.',
  z.object({
    session_id: sessionId,
    job_id: jobId,
    guard_id: guardId,
    hours: z.number().optional(),
    limit: z.number().int().positive().optional(),
  }),
);

const getEntitySummary = createReplayTool(
  'get_entity_summary',
  'Get durable historical context for a guard or account.',
  z.object({ entity_type: z.string(), entity_id: identifier }),
);

const getGuardLocations = createReplayTool(
  'get_guard_locations',
  'Get shift-so-far guard location and device heartbeat history.',
  z.object({
    session_id: sessionId,
    job_id: jobId,
    guard_id: guardId.optional(),
    after: z.string().optional(),
    include_pings: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
  }),
);

const getGuardStatus = createReplayTool(
  'get_guard_status',
  'Get current guard status for a job.',
  z.object({ job_id: jobId }),
);

const getJobChatMessages = createReplayTool(
  'get_job_chat_messages',
  'Get chat messages for a job.',
  z.object({
    job_id: jobId,
    session_id: sessionId.optional(),
    after: z.string().optional(),
    limit: z.number().int().positive().optional(),
  }),
);

const getJobCommunications = createReplayTool(
  'get_job_communications',
  'Get calls, texts, and emails already attempted for a job.',
  z.object({
    job_id: jobId,
    hours: z.number().optional(),
    include_timeline: z.boolean().optional(),
    limit: z.number().int().positive().optional(),
  }),
);

const getJobIncidents = createReplayTool(
  'get_job_incidents',
  'Get recorded incidents for a job.',
  z.object({ job_id: jobId, session_id: sessionId.optional() }),
);

const getJobLogs = createReplayTool(
  'get_job_logs',
  'Get job activity logs.',
  z.object({
    job_id: jobId,
    session_id: sessionId.optional(),
    after: z.string().optional(),
  }),
);

const getOpenObligations = createReplayTool(
  'get_open_obligations',
  'Get recorded client-defined obligation windows for this shift.',
  z.object({ session_id: sessionId }),
);

const getSiteHistory = createReplayTool(
  'get_site_history',
  'Get recent site incidents, flags, and open action items.',
  z.object({
    job_id: jobId,
    session_id: sessionId.optional(),
    days: z.number().positive().optional(),
  }),
);

const requestCopilotDm = createReplayTool(
  'request_copilot_dm',
  'Send a direct message to the assigned guard.',
  z.object({
    session_id: sessionId,
    recipient_guard_id: guardId,
    body: z.string(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
);

const saveChatImage = createReplayTool(
  'save_chat_image',
  'Simulate saving a chat image into the replay workspace without real I/O.',
  z.object({ image_url: z.string(), workspace_path: z.string() }),
);

export const copilotReplayTools = {
  Glob: globTool,
  Grep: grepTool,
  Read: readTool,
  Write: writeTool,
  add_copilot_note: addCopilotNote,
  create_copilot_alert: createCopilotAlert,
  create_copilot_task: createCopilotTask,
  create_feature_request: createFeatureRequest,
  escalate_to_human: escalateToHuman,
  escalate_to_ops: escalateToOps,
  fetch_chat_image: fetchChatImage,
  flag_copilot_guard: flagCopilotGuard,
  get_copilot_context: getCopilotContext,
  get_copilot_message_history: getCopilotMessageHistory,
  get_entity_summary: getEntitySummary,
  get_guard_locations: getGuardLocations,
  get_guard_status: getGuardStatus,
  get_job_chat_messages: getJobChatMessages,
  get_job_communications: getJobCommunications,
  get_job_incidents: getJobIncidents,
  get_job_logs: getJobLogs,
  get_open_obligations: getOpenObligations,
  get_site_history: getSiteHistory,
  request_copilot_dm: requestCopilotDm,
  save_chat_image: saveChatImage,
};

export function resetReplayToolCursors(requestContext: RequestContext): void {
  consumedReplayCalls.delete(requestContext);
}

export type { RecordedReplayToolCall };
