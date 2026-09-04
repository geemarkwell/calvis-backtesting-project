import type {
  CopilotShift,
  CopilotReplayMode,
  RecordedReplayToolCall,
  ReplayToolTraceEntry,
} from '../mastra/copilot/types';
import type { MessageInput } from '@mastra/core/agent/message-list';

export interface ShiftEvent {
  ts: string;
  type: string;
  text?: string | null;
  audio_transcription?: string | null;
  [key: string]: unknown;
}

export interface BaselineEntry {
  ts: string;
  type: string;
  turn?: number;
  trigger?: string;
  tool?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  ok?: boolean;
  error?: string | null;
  text?: string;
}

export interface ShiftBundle {
  shift: CopilotShift & {
    start: string;
    end: string;
    timezone: string;
    guard?: {
      id?: string | number;
      name?: string;
      [key: string]: unknown;
    };
  };
  events: ShiftEvent[];
  baseline: BaselineEntry[];
}

export interface CopilotSimulationAction {
  tool: string;
  input: Record<string, unknown>;
}

export interface CopilotOutputSnapshot {
  messages: string[];
  actions: CopilotSimulationAction[];
  silent: boolean;
}

export interface CopilotSimulationGuardReply {
  reply: string | null;
  source: 'historical' | 'simulated';
  historicalReply: string;
}

export interface CopilotSimulationTurn {
  turn: number;
  trigger: string;
  timestamp: string;
  shiftEvents: ShiftEvent[];
  guardMessages: string[];
  guardReplies: CopilotSimulationGuardReply[];
  copilotMessages: string[];
  modelText: string | null;
  finishReason: string;
  toolCalls: CopilotSimulationAction[];
  silent: boolean;
  skipped: boolean;
  candidateCopilotOutput: CopilotOutputSnapshot;
  historicalCopilotOutput: CopilotOutputSnapshot;
  diverged: boolean;
  divergedThisTurn: boolean;
  debug?: {
    systemPrompt: string;
    turnMessage: string;
    conversationHistory: MessageInput[];
    eventsSupplied: ShiftEvent[];
    toolTrace: ReplayToolTraceEntry[];
    modelConfiguration: CopilotModelConfiguration;
    copilotOutput: {
      text: string | null;
      messages: string[];
      finishReason: string;
    };
  };
}

export interface CopilotModelConfiguration {
  model: string;
  maxRetries: number;
  maxSteps: number;
}

export interface UpdatedPrompt {
  jobId: string;
  version: string;
  file: string;
  oldText: string;
  newText: string;
  intendedEffect: string;
}

export interface CopilotSimulationResponse {
  jobId: string;
  status: 'completed';
  startTurn: number;
  endTurn: number;
  replayMode: CopilotReplayMode;
  callNiko: boolean;
  modelConfiguration: CopilotModelConfiguration;
  updatedPrompt?: UpdatedPrompt;
  turns: CopilotSimulationTurn[];
  simulationNumber: number;
  logFile: string;
}

export type CopilotSimulationResult = Omit<
  CopilotSimulationResponse,
  'simulationNumber' | 'logFile'
>;

export type CopilotOriginalResponse = Omit<
  CopilotSimulationResult,
  'replayMode' | 'callNiko' | 'updatedPrompt'
> & {
  replayMode: 'original';
  callNiko: false;
};

export interface CopilotOriginalSourceOption {
  id: string;
  source: 'shift' | 'simulation';
  label: string;
  simulationNumber?: number;
  createdAt?: string;
  replayMode?: CopilotReplayMode;
  model?: string;
}

export interface CopilotOriginalSourcesResponse {
  jobId: string;
  startTurn: number;
  endTurn: number;
  sources: CopilotOriginalSourceOption[];
}

export interface CopilotSimulationLogTurn {
  turn: number;
  timestamp: string;
  trigger: string;
  guardMessages: CopilotSimulationGuardReply[];
  events: ShiftEvent[];
  originalCopilot: CopilotOutputSnapshot;
  newCopilot: CopilotOutputSnapshot & {
    modelText: string | null;
    stopReason: string;
    skipped: boolean;
  };
}

export interface CopilotSimulationLog {
  simulationNumber: number;
  createdAt: string;
  jobId: string;
  startTurn: number;
  endTurn: number;
  replayMode: CopilotReplayMode;
  callNiko: boolean;
  modelConfiguration: CopilotModelConfiguration;
  updatedPrompt?: UpdatedPrompt;
  context: ShiftBundle['shift'];
  turns: CopilotSimulationLogTurn[];
}

export interface SimulationEpisode {
  selectedTurns: Array<
    Required<Pick<BaselineEntry, 'ts' | 'turn' | 'trigger'>>
  >;
  replayToolCalls: RecordedReplayToolCall[];
  historyBoundary?: string;
}
