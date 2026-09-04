import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { MessageInput } from '@mastra/core/agent/message-list';
import { resolve } from 'node:path';
import {
  copilot,
  copilotModelConfiguration,
} from '../mastra/agents/copilot-agent';
import { createCopilotRequestContext } from '../mastra/copilot/request-context';
import { buildCopilotTurnMessage } from '../mastra/copilot/turn-builder';
import type { CopilotRequestContext } from '../mastra/copilot/types';
import { normalizeTrace } from '../mastra/theo/trace-normalizer';
import { simulateGuard } from '../mastra/niko/simulator';
import type { NikoConversationMessage } from '../mastra/niko/schemas';
import type { SimulateCopilotDto } from './dto/simulate-copilot.dto';
import { buildSimulationEpisode } from './episode-builder';
import {
  buildHistoricalReplayState,
  historyChatKey,
  type HistoricalReplayState,
} from './history-compactor';
import { eventsInInterval, extractGuardMessage } from './historical-turn-data';
import {
  baseToolName,
  buildHistoricalCopilotOutputs,
  copilotOutputsEqual,
  normalizeCopilotOutput,
} from './output-comparison';
import { findBundleRoot, loadShiftBundle } from './shift-loader';
import type {
  CopilotSimulationAction,
  CopilotSimulationGuardReply,
  CopilotSimulationResponse,
  CopilotSimulationResult,
  CopilotSimulationTurn,
  CopilotOutputSnapshot,
  BaselineEntry,
  ShiftBundle,
  ShiftEvent,
} from './copilot-simulation.types';
import type { CopilotReplayMode } from '../mastra/copilot/types';
import { writeSimulationLog } from './simulation-log-writer';
import { loadCandidatePrompt } from './candidate-prompt-loader';

const RECENT_GUARD_CONVERSATION_LIMIT = 12;
const EMPTY_COPILOT_OUTPUT: CopilotOutputSnapshot = {
  messages: [],
  actions: [],
  silent: true,
};

@Injectable()
export class CopilotSimulationService {
  async simulate(
    input: SimulateCopilotDto,
  ): Promise<CopilotSimulationResponse> {
    const bundleRoot = await findBundleRoot();
    const { jobId, bundle } = await loadShiftBundle(bundleRoot, input.jobId);
    const episode = buildSimulationEpisode(
      bundle,
      input.startTurn,
      input.endTurn,
    );
    const replayMode = normalizeReplayMode(input.replayMode);
    const promptVersion = normalizePromptVersion(input.promptVersion);
    const callNiko = normalizeCallNiko(input.callNiko);
    const debugEnabled = normalizeDebug(input.debug);
    if (promptVersion && replayMode !== 'candidate') {
      throw new BadRequestException(
        'promptVersion may be used only with replayMode "candidate".',
      );
    }
    let promptRoot = resolve(bundleRoot, 'prompts');
    let updatedPrompt: CopilotSimulationResult['updatedPrompt'];
    if (promptVersion) {
      try {
        const candidatePrompt = await loadCandidatePrompt({
          versionsRoot: resolve(bundleRoot, 'cie', 'prompt-versions'),
          jobId,
          version: promptVersion,
        });
        promptRoot = candidatePrompt.promptRoot;
        updatedPrompt = candidatePrompt.updatedPrompt;
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    const sessionId = findSessionId(bundle) ?? `simulation-${jobId}`;
    const assignedGuard = findAssignedGuard(bundle, jobId);
    const historicalState = buildHistoricalReplayState(
      bundle,
      episode.selectedTurns[0].turn,
      assignedGuard.id,
    );
    const requestContext = await createCopilotRequestContext({
      promptRoot,
      shift: bundle.shift,
      evidence: {
        shift: bundle.shift,
        events: bundle.events,
        copilotMessages: bundle.baseline
          .filter(
            (entry) =>
              entry.type === 'copilot_message' &&
              typeof entry.text === 'string',
          )
          .map((entry) => ({ ts: entry.ts, text: entry.text! })),
      },
      replayMode,
      replayToolCalls: episode.replayToolCalls,
      initialWorkspace: historicalState.workspace,
    });
    const history = buildHistoricalConversation(
      bundle,
      episode.selectedTurns[0].turn,
      historicalState,
    );
    const guardConversation = buildHistoricalGuardConversation(
      bundle,
      episode.historyBoundary,
    );
    const historicalCopilotOutputs = buildHistoricalCopilotOutputs(bundle);
    const turns: CopilotSimulationTurn[] = [];
    let previousBoundary = episode.historyBoundary;
    let diverged = false;
    let candidateCopilotMessageForReply: string | null =
      lastCopilotMessage(guardConversation);

    for (const turn of episode.selectedTurns) {
      const intervalEvents = eventsInInterval(
        bundle.events,
        previousBoundary,
        turn.ts,
      );
      const historicalGuardMessages = intervalEvents
        .filter((event) => event.type === 'guard_message')
        .map(extractGuardMessage)
        .filter((message): message is string => Boolean(message));
      const guardMessages: string[] = [];
      const guardReplies: CopilotSimulationGuardReply[] = [];
      const shiftEvents = intervalEvents;

      for (const historicalReply of historicalGuardMessages) {
        const useNiko = callNiko && diverged;
        const reply = useNiko
          ? await simulateGuardReply({
              bundle,
              guardConversation,
              candidateCopilotMessage: candidateCopilotMessageForReply,
              historicalGuardReply: historicalReply,
              turn: turn.turn,
            })
          : historicalReply;
        guardReplies.push({
          reply,
          source: useNiko ? 'simulated' : 'historical',
          historicalReply,
        });

        if (reply !== null) {
          guardMessages.push(reply);
          history.push({ role: 'user', content: reply });
          guardConversation.push({ role: 'guard', content: reply });
        }
      }

      const historicalCopilotOutput =
        historicalCopilotOutputs.get(turn.turn) ?? EMPTY_COPILOT_OUTPUT;
      const guardMessageTurnWasRemoved =
        callNiko &&
        diverged &&
        turn.trigger === 'guard_message' &&
        historicalGuardMessages.length > 0 &&
        guardMessages.length === 0;

      const turnMessage = await buildTurnMessage({
        bundle,
        promptRoot,
        sessionId,
        jobId,
        assignedGuard,
        turn,
        previousBoundary,
      });
      const turnInput: MessageInput[] = [
        ...history,
        { role: 'user', content: turnMessage },
      ];
      const toolTraceBefore = getToolTrace(requestContext).length;

      if (guardMessageTurnWasRemoved) {
        const candidateOutput = EMPTY_COPILOT_OUTPUT;
        const divergedThisTurn = !copilotOutputsEqual(
          candidateOutput,
          historicalCopilotOutput,
        );
        diverged ||= divergedThisTurn;
        candidateCopilotMessageForReply = null;
        turns.push({
          turn: turn.turn,
          trigger: turn.trigger,
          timestamp: turn.ts,
          shiftEvents,
          guardMessages,
          guardReplies,
          copilotMessages: [],
          modelText: null,
          finishReason: 'not_run',
          toolCalls: [],
          silent: true,
          skipped: true,
          candidateCopilotOutput: candidateOutput,
          historicalCopilotOutput,
          diverged,
          divergedThisTurn,
          ...(debugEnabled
            ? {
                debug: buildTurnDebug({
                  requestContext,
                  turnMessage,
                  conversationHistory: turnInput,
                  eventsSupplied: intervalEvents,
                  toolTraceBefore,
                  text: null,
                  messages: [],
                  finishReason: 'not_run',
                }),
              }
            : {}),
        });
        previousBoundary = turn.ts;
        continue;
      }

      const observedBefore = getObservedActions(requestContext).length;
      requestContext.set('copilot-active-turn', turn.turn);
      requestContext.set('copilot-active-timestamp', turn.ts);

      let result: Awaited<ReturnType<typeof copilot.generate>>;
      try {
        result = await copilot.generate(turnInput, { requestContext });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new InternalServerErrorException(
          `Copilot simulation failed on turn ${turn.turn}: ${message}`,
        );
      }

      const actions = getObservedActions(requestContext).slice(observedBefore);
      const copilotMessages = actions
        .filter((action) => action.tool === 'request_copilot_dm')
        .map((action) => action.input.body)
        .filter((body): body is string => typeof body === 'string');
      const candidateOutput = normalizeCopilotOutput(actions);
      const divergedThisTurn = !copilotOutputsEqual(
        candidateOutput,
        historicalCopilotOutput,
      );
      diverged ||= divergedThisTurn;

      history.push({ role: 'user', content: turnMessage });
      history.push(...(result.response.messages ?? []));
      for (const message of copilotMessages) {
        guardConversation.push({ role: 'copilot', content: message });
      }
      candidateCopilotMessageForReply = copilotMessages.at(-1) ?? null;
      turns.push({
        turn: turn.turn,
        trigger: turn.trigger,
        timestamp: turn.ts,
        shiftEvents,
        guardMessages,
        guardReplies,
        copilotMessages,
        modelText: result.text.trim() || null,
        finishReason: result.finishReason ?? 'unknown',
        toolCalls: actions,
        silent: candidateOutput.silent,
        skipped: false,
        candidateCopilotOutput: candidateOutput,
        historicalCopilotOutput,
        diverged,
        divergedThisTurn,
        ...(debugEnabled
          ? {
              debug: buildTurnDebug({
                requestContext,
                turnMessage,
                conversationHistory: turnInput,
                eventsSupplied: intervalEvents,
                toolTraceBefore,
                text: result.text.trim() || null,
                messages: copilotMessages,
                finishReason: result.finishReason ?? 'unknown',
              }),
            }
          : {}),
      });
      previousBoundary = turn.ts;
    }

    const simulation: CopilotSimulationResult = {
      jobId,
      status: 'completed',
      startTurn: episode.selectedTurns[0].turn,
      endTurn: episode.selectedTurns[episode.selectedTurns.length - 1].turn,
      replayMode,
      callNiko,
      modelConfiguration: copilotModelConfiguration,
      ...(updatedPrompt ? { updatedPrompt } : {}),
      turns,
    };

    try {
      const log = await writeSimulationLog({ bundleRoot, bundle, simulation });
      return { ...simulation, ...log };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(
        `Copilot simulation completed but could not be logged: ${message}`,
      );
    }
  }
}

interface SimulateGuardReplyInput {
  bundle: ShiftBundle;
  guardConversation: NikoConversationMessage[];
  candidateCopilotMessage: string | null;
  historicalGuardReply: string;
  turn: number;
}

async function simulateGuardReply({
  bundle,
  guardConversation,
  candidateCopilotMessage,
  historicalGuardReply,
  turn,
}: SimulateGuardReplyInput): Promise<string | null> {
  try {
    const simulated = await simulateGuard({
      guardProfile: bundle.shift.guard ?? {},
      shiftContext: bundle.shift,
      recentConversation: guardConversation.slice(
        -RECENT_GUARD_CONVERSATION_LIMIT,
      ),
      candidateCopilotMessage,
      historicalGuardReply,
    });
    return simulated.reply;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InternalServerErrorException(
      `Guard simulation failed before turn ${turn}: ${message}`,
    );
  }
}

function getObservedActions(
  requestContext: import('@mastra/core/request-context').RequestContext<CopilotRequestContext>,
): CopilotSimulationAction[] {
  return requestContext.get('copilot-observed-tool-calls') ?? [];
}

function getToolTrace(
  requestContext: import('@mastra/core/request-context').RequestContext<CopilotRequestContext>,
) {
  return requestContext.get('copilot-tool-trace') ?? [];
}

interface BuildTurnDebugInput {
  requestContext: import('@mastra/core/request-context').RequestContext<CopilotRequestContext>;
  turnMessage: string;
  conversationHistory: MessageInput[];
  eventsSupplied: ShiftEvent[];
  toolTraceBefore: number;
  text: string | null;
  messages: string[];
  finishReason: string;
}

function buildTurnDebug({
  requestContext,
  turnMessage,
  conversationHistory,
  eventsSupplied,
  toolTraceBefore,
  text,
  messages,
  finishReason,
}: BuildTurnDebugInput) {
  return {
    systemPrompt: requestContext.get('copilot-system-prompt'),
    turnMessage,
    conversationHistory,
    eventsSupplied,
    toolTrace: getToolTrace(requestContext).slice(toolTraceBefore),
    modelConfiguration: copilotModelConfiguration,
    copilotOutput: { text, messages, finishReason },
  };
}

function normalizeReplayMode(value: unknown): CopilotReplayMode {
  if (value === undefined) {
    return 'candidate';
  }
  if (value === 'original' || value === 'candidate') {
    return value;
  }
  throw new BadRequestException(
    'replayMode must be either original or candidate.',
  );
}

function normalizePromptVersion(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && /^0\.[1-9]\d*$/.test(value)) {
    return value;
  }
  throw new BadRequestException(
    'promptVersion must use 0.<positive integer>, for example "0.1".',
  );
}

function normalizeDebug(value: unknown): boolean {
  if (value === undefined) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw new BadRequestException('debug must be a boolean.');
}

function normalizeCallNiko(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw new BadRequestException('callNiko must be a boolean.');
}

function formatEvents(events: ShiftEvent[], type: string): string | undefined {
  const matchingEvents = events.filter((event) => event.type === type);
  return matchingEvents.length > 0
    ? JSON.stringify(matchingEvents, null, 2)
    : undefined;
}

function buildHistoricalConversation(
  bundle: ShiftBundle,
  beforeTurn: number,
  historicalState: HistoricalReplayState,
): MessageInput[] {
  const turns = bundle.baseline
    .filter(
      (
        entry,
      ): entry is BaselineEntry & {
        turn: number;
        trigger: string;
      } =>
        entry.type === 'turn_start' &&
        typeof entry.turn === 'number' &&
        typeof entry.trigger === 'string' &&
        entry.turn < beforeTurn,
    )
    .sort((left, right) => left.turn - right.turn);
  const toolCalls = historicalState.toolCalls;
  const copilotMessages = historicalCopilotMessagesByTurn(bundle);
  const history: MessageInput[] = [];
  let previousBoundary: string | undefined;

  for (const turn of turns) {
    const intervalEvents = eventsInInterval(
      bundle.events,
      previousBoundary,
      turn.ts,
    );
    for (const event of intervalEvents) {
      if (event.type !== 'guard_message') {
        continue;
      }
      const message = extractGuardMessage(event);
      if (
        message &&
        historicalState.retainedChatKeys.has(
          historyChatKey('guard', event.ts, message),
        )
      ) {
        history.push({ role: 'user', content: message });
      }
    }

    const recordedEntries = [
      ...toolCalls
        .filter((call) => call.turn === turn.turn)
        .map((call) => ({ kind: 'tool' as const, ts: call.timestamp, call })),
      ...(copilotMessages.get(turn.turn) ?? []).map((message) => ({
        kind: 'message' as const,
        ts: message.ts,
        message: message.text,
      })),
    ].sort((left, right) => left.ts.localeCompare(right.ts));

    for (const [index, entry] of recordedEntries.entries()) {
      if (entry.kind === 'message') {
        if (
          historicalState.retainedChatKeys.has(
            historyChatKey('copilot', entry.ts, entry.message),
          )
        ) {
          history.push({ role: 'assistant', content: entry.message });
        }
        continue;
      }
      const toolName = baseToolName(entry.call.tool);
      const toolCallId = `recorded-${turn.turn}-${index}`;
      history.push({
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId,
            toolName,
            input: entry.call.input,
          },
        ],
      });
      history.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId,
            toolName,
            output:
              entry.call.ok === false || entry.call.error
                ? {
                    type: 'error-text',
                    value:
                      entry.call.error ?? `Recorded ${toolName} call failed.`,
                  }
                : { type: 'json', value: toJsonValue(entry.call.output) },
          },
        ],
      } as MessageInput);
    }
    previousBoundary = turn.ts;
  }

  return history;
}

function historicalCopilotMessagesByTurn(
  bundle: ShiftBundle,
): Map<number, Array<{ ts: string; text: string }>> {
  const trace = normalizeTrace(bundle, { includeRawTelemetry: true });
  const turnNumberByRef = new Map(
    trace
      .filter((entry) => entry.type === 'turn_start')
      .map(
        (entry) =>
          [
            entry.ref,
            typeof (entry.content as { turn?: unknown })?.turn === 'number'
              ? (entry.content as { turn: number }).turn
              : undefined,
          ] as const,
      ),
  );
  const result = new Map<number, Array<{ ts: string; text: string }>>();

  for (const entry of trace) {
    if (
      entry.source !== 'baseline' ||
      entry.type !== 'copilot_message' ||
      typeof entry.content !== 'string' ||
      !entry.turnRef
    ) {
      continue;
    }
    const turn = turnNumberByRef.get(entry.turnRef);
    if (typeof turn !== 'number') {
      continue;
    }
    const messages = result.get(turn) ?? [];
    messages.push({ ts: entry.timestamp, text: entry.content });
    result.set(turn, messages);
  }

  return result;
}

interface BuildTurnMessageInput {
  bundle: ShiftBundle;
  promptRoot: string;
  sessionId: string;
  jobId: string;
  assignedGuard: { id: string | number; name: string };
  turn: Required<Pick<BaselineEntry, 'ts' | 'turn' | 'trigger'>>;
  previousBoundary?: string;
}

async function buildTurnMessage({
  bundle,
  promptRoot,
  sessionId,
  jobId,
  assignedGuard,
  turn,
  previousBoundary,
}: BuildTurnMessageInput): Promise<string> {
  const intervalEvents = eventsInInterval(
    bundle.events,
    previousBoundary,
    turn.ts,
  );
  return buildCopilotTurnMessage({
    promptRoot,
    sessionId,
    jobId,
    assignedGuards: [assignedGuard],
    turnNumber: turn.turn,
    trigger: turn.trigger,
    currentTime: formatCurrentTime(turn.ts, bundle.shift.timezone),
    ...buildShiftTiming(turn.ts, bundle.shift.start, bundle.shift.end),
    jobContext: turn.turn === 1 ? buildJobContext(bundle, jobId) : undefined,
    operatorMessages: formatEvents(intervalEvents, 'operator_message'),
    approvalDecisions: formatEvents(intervalEvents, 'approval_decision'),
    jobEvents: formatEvents(intervalEvents, 'job_log'),
  });
}

function buildJobContext(bundle: ShiftBundle, jobId: string): string {
  const site =
    bundle.shift.site && typeof bundle.shift.site === 'object'
      ? (bundle.shift.site as Record<string, unknown>)
      : {};
  const account =
    typeof site.account === 'string' ? site.account : `Job ${jobId}`;
  const address =
    typeof site.address === 'string' ? site.address : 'Address unavailable';
  const guardName = bundle.shift.guard?.name?.trim() || 'Assigned guard';
  return [
    `- Job #${jobId}: ${account}`,
    `- Location: ${address}`,
    `- Guards: ${guardName}`,
    '- Full details in context/job.json',
  ].join('\n');
}

function toJsonValue(
  value: unknown,
): null | boolean | number | string | object {
  if (value === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as
      null | boolean | number | string | object;
  } catch {
    return null;
  }
}

function buildHistoricalGuardConversation(
  bundle: ShiftBundle,
  through?: string,
): NikoConversationMessage[] {
  if (!through) {
    return [];
  }

  const messages: Array<{
    ts: string;
    message: NikoConversationMessage;
  }> = [];
  for (const event of bundle.events) {
    if (event.type !== 'guard_message' || event.ts > through) {
      continue;
    }
    const content = extractGuardMessage(event);
    if (content) {
      messages.push({
        ts: event.ts,
        message: { role: 'guard', content },
      });
    }
  }
  for (const entry of bundle.baseline) {
    if (
      entry.type === 'copilot_message' &&
      entry.ts <= through &&
      entry.text?.trim()
    ) {
      messages.push({
        ts: entry.ts,
        message: { role: 'copilot', content: entry.text },
      });
    }
  }

  return messages
    .sort((left, right) => left.ts.localeCompare(right.ts))
    .map((entry) => entry.message);
}

function lastCopilotMessage(
  conversation: NikoConversationMessage[],
): string | null {
  return (
    conversation.findLast((message) => message.role === 'copilot')?.content ??
    null
  );
}

function findSessionId(bundle: ShiftBundle): string | undefined {
  for (const entry of bundle.baseline) {
    const sessionId = entry.input?.session_id;
    if (typeof sessionId === 'string' && sessionId.trim()) {
      return sessionId;
    }
  }
  return undefined;
}

function findAssignedGuard(
  bundle: ShiftBundle,
  jobId: string,
): { id: string | number; name: string } {
  let guardId = bundle.shift.guard?.id;
  for (const entry of bundle.baseline) {
    const candidate = entry.input?.recipient_guard_id ?? entry.input?.guard_id;
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      guardId = candidate;
      break;
    }
  }

  return {
    id: guardId ?? `unknown-${jobId}`,
    name: bundle.shift.guard?.name?.trim() || 'Assigned guard',
  };
}

function buildShiftTiming(
  turnTimestamp: string,
  shiftStart: string,
  shiftEnd: string,
): { timeLeftMinutes: number } | { minutesUntilShiftStart: number } {
  const turnTime = new Date(turnTimestamp).getTime();
  const startTime = new Date(shiftStart).getTime();
  const endTime = new Date(shiftEnd).getTime();

  if (turnTime < startTime) {
    return {
      minutesUntilShiftStart: Math.max(
        0,
        Math.ceil((startTime - turnTime) / 60_000),
      ),
    };
  }

  return {
    timeLeftMinutes: Math.max(0, Math.ceil((endTime - turnTime) / 60_000)),
  };
}

export function formatCurrentTime(timestamp: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return `${parts.weekday} ${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second} ${timeZone}`;
}
