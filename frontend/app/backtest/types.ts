export type ReplayMode = "original" | "candidate";
export type BaselineSource = "shift" | `simulation:${number}`;

export interface SimulationRequest {
  jobId: string;
  startTurn: number;
  endTurn: number;
  replayMode: ReplayMode;
  promptVersion?: string;
  debug: boolean;
  callNiko: boolean;
}

export interface BacktestRequest extends SimulationRequest {
  callout: string;
  expectedBehavior: string;
  baselineSource: "shift" | "simulation";
  baselineSimulationNumber?: number;
}

export interface OriginalRequest {
  jobId: string;
  startTurn: number;
  endTurn: number;
  source: "shift" | "simulation";
  simulationNumber?: number;
}

export interface OriginalSourceOption {
  id: BaselineSource;
  source: "shift" | "simulation";
  label: string;
  simulationNumber?: number;
  createdAt?: string;
  replayMode?: ReplayMode;
  model?: string;
}

export interface OriginalSourcesResponse {
  jobId: string;
  startTurn: number;
  endTurn: number;
  sources: OriginalSourceOption[];
}

export interface SimulationAction {
  tool: string;
  input: Record<string, unknown>;
}

export interface GuardReply {
  reply: string | null;
  source: "historical" | "simulated";
  historicalReply: string;
}

export interface OutputSnapshot {
  messages: string[];
  actions: SimulationAction[];
  silent: boolean;
}

export interface TurnDebug {
  systemPrompt: string;
  turnMessage: string;
  conversationHistory: unknown[];
  eventsSupplied: unknown[];
  toolTrace: unknown[];
  modelConfiguration: ModelConfiguration;
  copilotOutput: {
    text: string | null;
    messages: string[];
    finishReason: string;
  };
}

export interface SimulationTurn {
  turn: number;
  trigger: string;
  timestamp: string;
  shiftEvents: Array<Record<string, unknown>>;
  guardMessages: string[];
  guardReplies: GuardReply[];
  copilotMessages: string[];
  modelText: string | null;
  finishReason: string;
  toolCalls: SimulationAction[];
  silent: boolean;
  skipped: boolean;
  candidateCopilotOutput: OutputSnapshot;
  historicalCopilotOutput: OutputSnapshot;
  diverged: boolean;
  divergedThisTurn: boolean;
  debug?: TurnDebug;
}

export interface ModelConfiguration {
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

export interface SimulationResponse {
  jobId: string;
  status: "completed";
  startTurn: number;
  endTurn: number;
  replayMode: ReplayMode;
  callNiko: boolean;
  modelConfiguration: ModelConfiguration;
  updatedPrompt?: UpdatedPrompt;
  turns: SimulationTurn[];
  simulationNumber?: number;
  logFile?: string;
}

export type PanelStatus = "idle" | "loading" | "success" | "error";

export interface PanelState {
  status: PanelStatus;
  data: SimulationResponse | null;
  error: string | null;
}

export interface TheoContext {
  simTarget: number;
  startTurn: number;
  endTurn: number;
}

export interface TheoRequest {
  whatWentWrong: string;
  badResponses: TheoContext[];
  expectedBehavior: string;
}

export interface TheoPromptChange {
  file: string;
  old_text: string;
  new_text: string;
  intended_effect: string;
}

export interface TheoDiagnosis {
  job_ids: string[];
  what_went_wrong: string;
  failure_mode: string;
  evidence_windows: Array<{
    job_id: string;
    start_turn: number;
    end_turn: number;
    trace_refs: string[];
  }>;
  observed_behavior: Array<{
    claim: string;
    trace_refs: string[];
  }>;
  expected_behavior: string;
  relevant_turns: Array<{
    turn_ref: string;
    trigger: string;
    instruction_file: string;
  }>;
  prompt_diagnosis: {
    file: string;
    section: string;
    exact_text: string;
    diagnosis_type:
      | "missing"
      | "ambiguous"
      | "conflicting"
      | "overly_forceful"
      | "incorrectly_prioritized";
    explanation: string;
  };
  hypothesis: string;
  proposed_edit: TheoPromptChange;
  risks: string[];
  confidence: number;
  uncertainties: string[];
}

export interface TheoResponse {
  runId: string;
  artifactDirectory: string;
  candidatePromptJobId: string;
  candidatePromptVersion: string;
  candidatePromptRoot: string;
  diagnosis: TheoDiagnosis;
  suggestedPromptChange: TheoPromptChange;
}

export interface CandidateEvaluation {
  runId: string;
  judgedAt: string;
  fixed: boolean;
  verdict: "yes" | "no";
  confidence: number | null;
  summary: string;
}

export interface CandidateDecision {
  jobId: string;
  version: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  decidedAt: string | null;
  evaluation: CandidateEvaluation | null;
}

export interface CandidateDecisionResult {
  decision: CandidateDecision;
  updatedPrompt: UpdatedPrompt;
}

export type MayaMeasurement = number | boolean | null;

export interface MayaCriterion {
  claim: string;
  old_measurement: MayaMeasurement;
  candidate_measurement: MayaMeasurement;
  passed: boolean;
  evidence: string[];
}

export interface MayaVerdict {
  fixed: boolean;
  verdict: "yes" | "no";
  summary: string;
  confidence: number | null;
  criteria: MayaCriterion[];
  limitations: string[];
}

export interface MayaReplayReference {
  simulationNumber: number | null;
  logFile: string | null;
}

export interface MayaJudgment {
  version: 0 | 1;
  runId: string;
  judgedAt: string;
  jobId: string;
  callout: string;
  oldReplay: MayaReplayReference;
  candidateReplay: MayaReplayReference;
  verdict: MayaVerdict;
}

export interface MayaJudgmentHistory {
  jobId: string;
  judgments: MayaJudgment[];
}

export interface MayaJudgeRequest {
  callout: string;
  oldReplay: SimulationResponse;
  candidateReplay: SimulationResponse;
}

export interface MayaJudgeResponse {
  runId: string;
  artifactDirectory: string;
  verdict: MayaVerdict;
  judgment: MayaJudgment;
}

export interface BacktestResponse {
  theo: TheoResponse;
  oldReplay: SimulationResponse;
  candidateReplay: SimulationResponse;
  updatedPrompt: UpdatedPrompt;
  candidateDecision: CandidateDecision;
  maya: MayaJudgeResponse | null;
  mayaError: string | null;
}
