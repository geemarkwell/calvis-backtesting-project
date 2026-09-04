export interface CopilotShift {
  id: string | number;
  [key: string]: unknown;
}

export interface RecordedReplayToolCall {
  turn: number;
  timestamp: string;
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  ok?: boolean;
  error?: string | null;
}

export type CopilotReplayMode = 'original' | 'candidate';

export type ReplayToolResolution =
  'recorded' | 'simulated_side_effect' | 'shift_data' | 'unavailable_in_replay';

export interface ReplayToolTraceEntry {
  turn: number;
  tool: string;
  input: Record<string, unknown>;
  resolution: ReplayToolResolution;
  matchedRecordedCall?: {
    timestamp: string;
    input: Record<string, unknown>;
  };
  result?: unknown;
  error?: string;
}

export interface ReplayEvidence {
  shift: CopilotShift;
  events: Array<{
    ts: string;
    type: string;
    [key: string]: unknown;
  }>;
  copilotMessages: Array<{ ts: string; text: string }>;
}

export interface CopilotRequestContext {
  'copilot-system-prompt': string;
  'copilot-replay-tool-calls'?: RecordedReplayToolCall[];
  'copilot-replay-mode': CopilotReplayMode;
  'copilot-active-turn'?: number;
  'copilot-active-timestamp'?: string;
  'copilot-replay-evidence': ReplayEvidence;
  'copilot-virtual-workspace': Record<string, string>;
  'copilot-tool-trace'?: ReplayToolTraceEntry[];
  'copilot-observed-tool-calls'?: Array<{
    tool: string;
    input: Record<string, unknown>;
  }>;
}

export type CopilotConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export interface AssignedGuard {
  id: string | number;
  name: string;
}

export interface CopilotTurnInput {
  promptRoot: string;
  sessionId: string;
  jobId: string | number;
  assignedGuards: AssignedGuard[];
  turnNumber: number;
  trigger: string;
  currentTime: string;
  timeLeftMinutes?: number;
  minutesUntilShiftStart?: number;
  jobContext?: string;
  previousSessionAnalysis?: string;
  turnHistory?: string;
  operatorMessages?: string;
  approvalDecisions?: string;
  jobEvents?: string;
  actionsTaken?: string;
  wakeReason?: string;
}
