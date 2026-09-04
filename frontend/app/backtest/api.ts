import type {
  BacktestRequest,
  BacktestResponse,
  CandidateDecisionResult,
  MayaJudgeRequest,
  MayaJudgeResponse,
  MayaJudgmentHistory,
  OriginalRequest,
  OriginalSourcesResponse,
  SimulationRequest,
  SimulationResponse,
  TheoRequest,
  TheoResponse,
} from "./types";

export async function decideCandidate(
  action: "accept" | "reject",
  candidate: { jobId: string; version: string },
  signal?: AbortSignal,
): Promise<CandidateDecisionResult> {
  const response = await fetch(`/api/candidates/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(candidate),
    signal,
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response, `Candidate ${action} failed`));
  }
  const payload: unknown = await response.json();
  if (!isCandidateDecisionResult(payload)) {
    throw new Error(`Candidate ${action} API returned an invalid response.`);
  }
  return payload;
}

export async function runCopilotBacktest(
  request: BacktestRequest,
  signal?: AbortSignal,
): Promise<BacktestResponse> {
  const response = await fetch("/api/backtest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Backtest failed"));
  }

  const payload: unknown = await response.json();
  if (!isBacktestResponse(payload)) {
    throw new Error("Backtest API returned an invalid response.");
  }
  return payload;
}

export async function judgeWithMaya(
  request: MayaJudgeRequest,
  signal?: AbortSignal,
): Promise<MayaJudgeResponse> {
  const response = await fetch("/api/evaluations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Maya judgment failed"));
  }

  const payload: unknown = await response.json();
  if (!isMayaJudgeResponse(payload)) {
    throw new Error("Maya API returned an invalid response.");
  }
  return payload;
}

export async function getMayaJudgments(
  jobId: string,
  signal?: AbortSignal,
): Promise<MayaJudgmentHistory> {
  const search = new URLSearchParams({ jobId });
  const response = await fetch(`/api/evaluations?${search}`, { signal });
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Evaluation history failed"));
  }

  const payload: unknown = await response.json();
  if (!isMayaJudgmentHistory(payload)) {
    throw new Error("Evaluation API returned an invalid response.");
  }
  return payload;
}

export async function getOriginalCopilot(
  request: OriginalRequest,
  signal?: AbortSignal,
): Promise<SimulationResponse> {
  const search = new URLSearchParams({
    jobId: request.jobId,
    startTurn: String(request.startTurn),
    endTurn: String(request.endTurn),
    source: request.source,
  });
  if (request.simulationNumber !== undefined) {
    search.set("simulationNumber", String(request.simulationNumber));
  }
  const response = await fetch(`/api/original?${search}`, { signal });

  return parseResponse(response);
}

export async function listOriginalSources(
  request: Pick<OriginalRequest, "jobId" | "startTurn" | "endTurn">,
  signal?: AbortSignal,
): Promise<OriginalSourcesResponse> {
  const search = new URLSearchParams({
    jobId: request.jobId,
    startTurn: String(request.startTurn),
    endTurn: String(request.endTurn),
  });
  const response = await fetch(`/api/original-sources?${search}`, { signal });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  const payload: unknown = await response.json();
  if (!isOriginalSourcesResponse(payload)) {
    throw new Error("Original source API returned an invalid response.");
  }
  return payload;
}

export async function simulateCopilot(
  request: SimulationRequest,
  signal?: AbortSignal,
): Promise<SimulationResponse> {
  const response = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  return parseResponse(response);
}

export async function diagnoseWithTheo(
  request: TheoRequest,
  signal?: AbortSignal,
): Promise<TheoResponse> {
  const response = await fetch("/api/theo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response, "Theo diagnosis failed"));
  }

  const payload: unknown = await response.json();
  if (!isTheoResponse(payload)) {
    throw new Error("Theo API returned an invalid response.");
  }
  return payload;
}

async function parseResponse(response: Response): Promise<SimulationResponse> {
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Simulation failed"));
  }

  const payload: unknown = await response.json();
  if (!isSimulationResponse(payload)) {
    throw new Error("Copilot API returned an invalid response.");
  }

  return payload;
}

async function errorMessage(
  response: Response,
  prefix = "Request failed",
): Promise<string> {
  let detail = `${response.status} ${response.statusText}`.trim();

  try {
    const payload: unknown = await response.json();
    if (isRecord(payload)) {
      const message = payload.message;
      if (typeof message === "string") {
        detail = message;
      } else if (Array.isArray(message)) {
        detail = message.filter((item) => typeof item === "string").join(" ");
      }
    }
  } catch {
    // Keep HTTP status when response has no JSON error body.
  }

  return `${prefix}: ${detail}`;
}

function isSimulationResponse(value: unknown): value is SimulationResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.jobId === "string" &&
    value.status === "completed" &&
    typeof value.startTurn === "number" &&
    typeof value.endTurn === "number" &&
    (value.replayMode === "original" || value.replayMode === "candidate") &&
    typeof value.callNiko === "boolean" &&
    (value.updatedPrompt === undefined ||
      isUpdatedPrompt(value.updatedPrompt)) &&
    Array.isArray(value.turns) &&
    isRecord(value.modelConfiguration)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOriginalSourcesResponse(
  value: unknown,
): value is OriginalSourcesResponse {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    typeof value.startTurn === "number" &&
    typeof value.endTurn === "number" &&
    Array.isArray(value.sources) &&
    value.sources.every(
      (source) =>
        isRecord(source) &&
        typeof source.id === "string" &&
        (source.source === "shift" || source.source === "simulation") &&
        typeof source.label === "string",
    )
  );
}

function isTheoResponse(value: unknown): value is TheoResponse {
  if (
    !isRecord(value) ||
    typeof value.runId !== "string" ||
    typeof value.artifactDirectory !== "string" ||
    typeof value.candidatePromptJobId !== "string" ||
    typeof value.candidatePromptVersion !== "string" ||
    typeof value.candidatePromptRoot !== "string" ||
    !isRecord(value.diagnosis) ||
    !isPromptChange(value.suggestedPromptChange)
  ) {
    return false;
  }

  const diagnosis = value.diagnosis;
  return (
    Array.isArray(diagnosis.job_ids) &&
    diagnosis.job_ids.every((jobId) => typeof jobId === "string") &&
    typeof diagnosis.what_went_wrong === "string" &&
    typeof diagnosis.failure_mode === "string" &&
    Array.isArray(diagnosis.evidence_windows) &&
    Array.isArray(diagnosis.observed_behavior) &&
    typeof diagnosis.expected_behavior === "string" &&
    Array.isArray(diagnosis.relevant_turns) &&
    isRecord(diagnosis.prompt_diagnosis) &&
    typeof diagnosis.prompt_diagnosis.file === "string" &&
    typeof diagnosis.prompt_diagnosis.section === "string" &&
    typeof diagnosis.prompt_diagnosis.exact_text === "string" &&
    typeof diagnosis.prompt_diagnosis.diagnosis_type === "string" &&
    typeof diagnosis.prompt_diagnosis.explanation === "string" &&
    typeof diagnosis.hypothesis === "string" &&
    isPromptChange(diagnosis.proposed_edit) &&
    Array.isArray(diagnosis.risks) &&
    diagnosis.risks.every((risk) => typeof risk === "string") &&
    typeof diagnosis.confidence === "number" &&
    Array.isArray(diagnosis.uncertainties) &&
    diagnosis.uncertainties.every(
      (uncertainty) => typeof uncertainty === "string",
    )
  );
}

function isPromptChange(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.file === "string" &&
    typeof value.old_text === "string" &&
    typeof value.new_text === "string" &&
    typeof value.intended_effect === "string"
  );
}

function isUpdatedPrompt(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    typeof value.version === "string" &&
    typeof value.file === "string" &&
    typeof value.oldText === "string" &&
    typeof value.newText === "string" &&
    typeof value.intendedEffect === "string"
  );
}

function isMayaJudgmentHistory(value: unknown): value is MayaJudgmentHistory {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    Array.isArray(value.judgments) &&
    value.judgments.every(isMayaJudgment)
  );
}

function isMayaJudgeResponse(value: unknown): value is MayaJudgeResponse {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    typeof value.artifactDirectory === "string" &&
    isMayaVerdict(value.verdict) &&
    isMayaJudgment(value.judgment)
  );
}

function isBacktestResponse(value: unknown): value is BacktestResponse {
  return (
    isRecord(value) &&
    isTheoResponse(value.theo) &&
    isSimulationResponse(value.oldReplay) &&
    isSimulationResponse(value.candidateReplay) &&
    isUpdatedPrompt(value.updatedPrompt) &&
    isCandidateDecision(value.candidateDecision) &&
    (value.maya === null || isMayaJudgeResponse(value.maya)) &&
    (value.mayaError === null || typeof value.mayaError === "string")
  );
}

function isCandidateDecisionResult(
  value: unknown,
): value is CandidateDecisionResult {
  return (
    isRecord(value) &&
    isCandidateDecision(value.decision) &&
    isUpdatedPrompt(value.updatedPrompt)
  );
}

function isCandidateDecision(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    typeof value.version === "string" &&
    (value.status === "pending" ||
      value.status === "accepted" ||
      value.status === "rejected") &&
    typeof value.createdAt === "string" &&
    (value.decidedAt === null || typeof value.decidedAt === "string") &&
    (value.evaluation === null || isCandidateEvaluation(value.evaluation))
  );
}

function isCandidateEvaluation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    typeof value.judgedAt === "string" &&
    typeof value.fixed === "boolean" &&
    (value.verdict === "yes" || value.verdict === "no") &&
    (value.confidence === null || typeof value.confidence === "number") &&
    typeof value.summary === "string"
  );
}

function isMayaJudgment(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.version === 0 || value.version === 1) &&
    typeof value.runId === "string" &&
    typeof value.judgedAt === "string" &&
    typeof value.jobId === "string" &&
    typeof value.callout === "string" &&
    isReplayReference(value.oldReplay) &&
    isReplayReference(value.candidateReplay) &&
    isMayaVerdict(value.verdict)
  );
}

function isReplayReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.simulationNumber === null ||
      (typeof value.simulationNumber === "number" &&
        Number.isSafeInteger(value.simulationNumber) &&
        value.simulationNumber > 0)) &&
    (value.logFile === null || typeof value.logFile === "string")
  );
}

function isMayaVerdict(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.fixed === "boolean" &&
    (value.verdict === "yes" || value.verdict === "no") &&
    typeof value.summary === "string" &&
    (value.confidence === null ||
      (typeof value.confidence === "number" &&
        Number.isInteger(value.confidence) &&
        value.confidence >= 0 &&
        value.confidence <= 100)) &&
    Array.isArray(value.criteria) &&
    value.criteria.every(isMayaCriterion) &&
    Array.isArray(value.limitations) &&
    value.limitations.every((limitation) => typeof limitation === "string")
  );
}

function isMayaCriterion(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.claim === "string" &&
    isMayaMeasurement(value.old_measurement) &&
    isMayaMeasurement(value.candidate_measurement) &&
    typeof value.passed === "boolean" &&
    Array.isArray(value.evidence) &&
    value.evidence.every((reference) => typeof reference === "string")
  );
}

function isMayaMeasurement(value: unknown): boolean {
  return (
    value === null || typeof value === "number" || typeof value === "boolean"
  );
}
