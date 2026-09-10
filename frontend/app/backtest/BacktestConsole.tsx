"use client";

import { useEffect, useRef, useState, type UIEvent } from "react";
import {
  getDiagnosisRun,
  getOriginalCopilot,
  listDiagnosisRuns,
  listOriginalSources,
  runCopilotBacktest,
} from "./api";
import { ControlDeck, type BacktestFormState } from "./components/ControlDeck";
import { ChatPanel } from "./components/ChatPanel";
import { CandidateReview } from "./components/CandidateReview";
import { EvaluationPanel } from "./components/EvaluationPanel";
import { TheoPanel } from "./components/TheoPanel";
import type {
  BacktestResponse,
  BacktestRequest,
  DiagnoseResponse,
  DiagnoseRunSummary,
  PanelState,
  OriginalRequest,
  OriginalSourceOption,
  SimulationRequest,
  SimulationResponse,
  TheoContext,
} from "./types";

const IDLE_PANEL: PanelState = {
  status: "idle",
  data: null,
  error: null,
};

const DEFAULT_BASELINE_OPTIONS: OriginalSourceOption[] = [
  { id: "shift", source: "shift", label: "Recorded shift" },
];

type DiagnosisFinding =
  | DiagnoseResponse["llmFindings"][number]
  | DiagnoseResponse["patterns"][number];

interface DiagnosisBacktestTargetResult {
  findingId: string;
  findingTitle: string;
  result: BacktestResponse;
}

const INITIAL_FORM: BacktestFormState = {
  jobId: "",
  callout: "",
  expectedBehavior: "",
  startTurn: "",
  endTurn: "",
  baselineSource: "shift",
  diagnosisRunId: "",
  replayMode: "candidate",
  debug: false,
  evaluate: false,
  callNiko: false,
  useCompactContext: true,
};

export default function BacktestConsole() {
  const [view, setView] = useState<"backtest" | "theo" | "evaluation">(
    "backtest",
  );
  const [form, setForm] = useState(INITIAL_FORM);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [original, setOriginal] = useState<PanelState>(IDLE_PANEL);
  const [comparison, setComparison] = useState<PanelState>(IDLE_PANEL);
  const [baselineOptions, setBaselineOptions] = useState(
    DEFAULT_BASELINE_OPTIONS,
  );
  const [baselineOptionsLoading, setBaselineOptionsLoading] = useState(false);
  const [diagnosisRuns, setDiagnosisRuns] = useState<DiagnoseRunSummary[]>([]);
  const [diagnosisRunsLoading, setDiagnosisRunsLoading] = useState(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResponse | null>(
    null,
  );
  const [diagnosisBacktestResults, setDiagnosisBacktestResults] = useState<
    DiagnosisBacktestTargetResult[]
  >([]);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnoseResponse | null>(
    null,
  );
  const [selectedDiagnosisPreview, setSelectedDiagnosisPreview] =
    useState<DiagnoseResponse | null>(null);
  const [selectedDiagnosisLoading, setSelectedDiagnosisLoading] = useState(false);
  const [selectedDiagnosisError, setSelectedDiagnosisError] = useState<string | null>(
    null,
  );
  const [selectedDiagnosisFindingId, setSelectedDiagnosisFindingId] = useState<string>("");
  const requestRef = useRef<AbortController | null>(null);
  const originalScrollRef = useRef<HTMLDivElement>(null);
  const comparisonScrollRef = useRef<HTMLDivElement>(null);
  const syncingScrollRef = useRef(false);
  const busy = original.status === "loading" || comparison.status === "loading";
  const { jobId, startTurn, endTurn } = form;
  const theoContext = contextFromSimulation(comparison.data);
  const theoCallout = form.callout.trim() || null;
  const evaluationJobId = /^\d+$/.test(jobId.trim()) ? jobId.trim() : null;

  useEffect(() => {
    const controller = new AbortController();
    setDiagnosisRunsLoading(true);
    void listDiagnosisRuns(controller.signal)
      .then((result) => setDiagnosisRuns(result.runs))
      .catch(() => setDiagnosisRuns([]))
      .finally(() => {
        if (!controller.signal.aborted) setDiagnosisRunsLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!form.evaluate || !form.diagnosisRunId) {
      setSelectedDiagnosisPreview(null);
      setSelectedDiagnosisError(null);
      setSelectedDiagnosisLoading(false);
      setSelectedDiagnosisFindingId("");
      return;
    }

    const controller = new AbortController();
    setSelectedDiagnosisLoading(true);
    setSelectedDiagnosisError(null);
    void getDiagnosisRun(form.diagnosisRunId, controller.signal)
      .then((run) => {
        if (!controller.signal.aborted) {
          setSelectedDiagnosisPreview(run);
          setSelectedDiagnosisFindingId("");
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSelectedDiagnosisPreview(null);
          setSelectedDiagnosisError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSelectedDiagnosisLoading(false);
        }
      });

    return () => controller.abort();
  }, [form.evaluate, form.diagnosisRunId]);

  useEffect(() => {
    const selected = diagnosisRuns.find((run) => run.runId === form.diagnosisRunId);
    if (!selected) return;
    setForm((current) =>
      current.jobId === selected.jobId &&
      current.startTurn === String(selected.startTurn) &&
      current.endTurn === String(selected.endTurn)
        ? current
        : {
            ...current,
            jobId: selected.jobId,
            startTurn: String(selected.startTurn),
            endTurn: String(selected.endTurn),
          },
    );
  }, [diagnosisRuns, form.diagnosisRunId]);

  useEffect(() => {
    const coordinates = sourceCoordinates(jobId, startTurn, endTurn);
    if (!coordinates) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void listOriginalSources(coordinates, controller.signal)
        .then((result) => {
          setBaselineOptions(result.sources);
          setForm((current) =>
            result.sources.some(
              (source) => source.id === current.baselineSource,
            )
              ? current
              : { ...current, baselineSource: "shift" },
          );
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setBaselineOptions(DEFAULT_BASELINE_OPTIONS);
            setForm((current) => ({
              ...current,
              baselineSource: "shift",
            }));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setBaselineOptionsLoading(false);
          }
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [jobId, startTurn, endTurn]);

  function updateForm(next: BacktestFormState) {
    const jobChanged = next.jobId !== form.jobId;
    const coordinatesChanged =
      jobChanged ||
      next.startTurn !== form.startTurn ||
      next.endTurn !== form.endTurn;
    if (!coordinatesChanged) {
      setForm(next);
      return;
    }

    const currentDefaultCallout = calloutForJob(form.jobId.trim());
    const shouldUpdateDefaultCallout =
      jobChanged &&
      (!form.callout.trim() || form.callout === currentDefaultCallout);
    setForm({
      ...next,
      callout: shouldUpdateDefaultCallout
        ? (calloutForJob(next.jobId.trim()) ?? "")
        : next.callout,
      baselineSource: "shift",
    });
    setBacktestResult(null);
    setDiagnosisBacktestResults([]);
    setBaselineOptions(DEFAULT_BASELINE_OPTIONS);
    setBaselineOptionsLoading(
      Boolean(sourceCoordinates(next.jobId, next.startTurn, next.endTurn)),
    );
  }

  async function executeBacktest() {
    const selectedDiagnosisRun = diagnosisRuns.find(
      (run) => run.runId === form.diagnosisRunId,
    );
    const parsed = parseForm(form, selectedDiagnosisRun);
    if (typeof parsed === "string") {
      setValidationError(parsed);
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setValidationError(null);
    setBacktestResult(null);
    setDiagnosisBacktestResults([]);
    setDiagnosisResult(null);

    if (form.evaluate) {
      setOriginal({ status: "loading", data: null, error: null });
      setComparison({ status: "loading", data: null, error: null });
      try {
        const diagnosis = await getDiagnosisRun(
          form.diagnosisRunId,
          controller.signal,
        );
        const findings = allDiagnosisFindings(diagnosis);
        const finding = findings.find(
          (item) => item.id === selectedDiagnosisFindingId,
        );
        if (!finding) {
          throw new Error("SELECT ONE DIAGNOSIS TARGET TO BACKTEST.");
        }
        const result = await runCopilotBacktest(
          diagnosisBacktestRequest(parsed.simulation, finding),
          controller.signal,
        );
        if (controller.signal.aborted) {
          return;
        }
        setDiagnosisResult(diagnosis);
        setDiagnosisBacktestResults([
          {
            findingId: finding.id,
            findingTitle: finding.title,
            result,
          },
        ]);
        setBacktestResult(result);
        setOriginal({ status: "success", data: result.oldReplay, error: null });
        setComparison({
          status: "success",
          data: result.candidateReplay,
          error: null,
        });
        setValidationError(
          result.mayaError ? `MAYA JUDGMENT FAILED FOR ${finding.id}` : null,
        );
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error);
          setComparison({ status: "error", data: null, error: message });
          setOriginal(IDLE_PANEL);
        }
      }
      return;
    }

    setOriginal({ status: "loading", data: null, error: null });
    setComparison({ status: "loading", data: null, error: null });
    const originalResult = loadOriginalPanel(
      getOriginalCopilot(
        originalRequest(parsed.simulation, form.baselineSource),
        controller.signal,
      ),
      setOriginal,
      controller.signal,
    );

    try {
      const result = await runCopilotBacktest(
        backtestRequest(parsed, form.baselineSource),
        controller.signal,
      );
      if (controller.signal.aborted) {
        return;
      }
      setComparison({
        status: "success",
        data: result.candidateReplay,
        error: null,
      });
      setBacktestResult(result);
      setValidationError(
        result.mayaError ? `MAYA JUDGMENT FAILED: ${result.mayaError}` : null,
      );
      if ((await originalResult) === null && !controller.signal.aborted) {
        setOriginal({
          status: "success",
          data: result.oldReplay,
          error: null,
        });
      }
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        setComparison({ status: "error", data: null, error: message });
      }
    }
  }

  function synchronizeScroll(
    event: UIEvent<HTMLDivElement>,
    target: HTMLDivElement | null,
  ) {
    if (syncingScrollRef.current || !target) {
      return;
    }

    const source = event.currentTarget;
    const sourceRange = source.scrollHeight - source.clientHeight;
    const targetRange = target.scrollHeight - target.clientHeight;
    if (sourceRange <= 0 || targetRange <= 0) {
      return;
    }

    syncingScrollRef.current = true;
    target.scrollTop = (source.scrollTop / sourceRange) * targetRange;
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }

  return (
    <main className="app-shell">
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-mark">C</span>
          <div>
            <strong>CALVIS</strong>
            <small>COPILOT IMPROVEMENT ENGINE</small>
          </div>
        </div>
      </header>

      <section className="hero-band">
        <div>
          {view === "backtest" ? (
            <h1>
              BACK<span>/</span>TEST
            </h1>
          ) : view === "theo" ? (
            <h1>THEO</h1>
          ) : (
            <h1>EVALUATION</h1>
          )}
        </div>
        {view === "backtest" ? (
          <p>
            One historical shift. Two prompt trajectories. Inspect every
            message, silence decision, and escalation before deployment.
          </p>
        ) : view === "theo" ? (
          <p>
            Diagnose prompt-level causes from selected responses and produce one
            minimal suggested edit.
          </p>
        ) : (
          <p>
            Follow Maya judgment confidence over time and inspect each
            evaluation result.
          </p>
        )}
        {/* <div className="barcode" aria-hidden="true" /> */}
      </section>

      <div hidden={view !== "backtest"}>
        <ControlDeck
          value={form}
          busy={busy}
          validationError={validationError}
          baselineOptions={baselineOptions}
          baselineOptionsLoading={baselineOptionsLoading}
          diagnosisRuns={diagnosisRuns}
          diagnosisRunsLoading={diagnosisRunsLoading}
          theoAvailable={theoContext !== null}
          evaluationAvailable={evaluationJobId !== null}
          onChange={updateForm}
          onSubmit={() => void executeBacktest()}
          onTheo={() => setView("theo")}
          onEvaluation={() => setView("evaluation")}
        />

        {form.evaluate && (
          <TheoParamsPreview
            diagnosis={selectedDiagnosisPreview}
            loading={selectedDiagnosisLoading}
            error={selectedDiagnosisError}
            selectedFindingId={selectedDiagnosisFindingId}
            replayStartTurn={form.startTurn}
            replayEndTurn={form.endTurn}
            onSelectFinding={(findingId) => {
              setSelectedDiagnosisFindingId(findingId);
              setDiagnosisBacktestResults([]);
              setBacktestResult(null);
              setDiagnosisResult(null);
              setOriginal(IDLE_PANEL);
              setComparison(IDLE_PANEL);
            }}
          />
        )}

        {form.evaluate && (
          <DiagnosisBacktestResult state={comparison} result={diagnosisResult} />
        )}

        <section className="comparison-grid">
          <ChatPanel
            title="Original agent"
            state={original}
            scrollRef={originalScrollRef}
            onScroll={(event) =>
              synchronizeScroll(event, comparisonScrollRef.current)
            }
          />
          <ChatPanel
            title="New agent"
            state={comparison}
            scrollRef={comparisonScrollRef}
            onScroll={(event) =>
              synchronizeScroll(event, originalScrollRef.current)
            }
          />
        </section>

        {form.evaluate
          ? diagnosisBacktestResults.map((target) => (
              <section key={target.findingId} className="candidate-review">
                <header>
                  <div>
                    <span className="candidate-review__kicker">MAYA TARGET</span>
                    <h2>{target.findingId}</h2>
                  </div>
                  <strong data-status={target.result.maya?.verdict.fixed ? "accepted" : "rejected"}>
                    {target.result.maya?.verdict.fixed ? "FIXED" : "REVIEW"}
                  </strong>
                </header>
                <div className="candidate-review__grid">
                  <section>
                    <span>PATTERN</span>
                    <h3>{target.findingTitle}</h3>
                    <p>{target.result.maya?.verdict.summary ?? target.result.mayaError}</p>
                  </section>
                </div>
                <CandidateReview
                  result={target.result}
                  onDecision={(decision) =>
                    setDiagnosisBacktestResults((current) =>
                      current.map((item) =>
                        item.findingId === target.findingId
                          ? {
                              ...item,
                              result: { ...item.result, candidateDecision: decision },
                            }
                          : item,
                      ),
                    )
                  }
                />
              </section>
            ))
          : backtestResult && (
              <CandidateReview
                result={backtestResult}
                onDecision={(decision) =>
                  setBacktestResult((current) =>
                    current ? { ...current, candidateDecision: decision } : current,
                  )
                }
              />
            )}
      </div>

      {theoContext && (
        <div hidden={view !== "theo"}>
          <TheoPanel
            key={`${theoContext.simTarget}:${theoContext.startTurn}:${theoContext.endTurn}`}
            context={theoContext}
            callout={theoCallout}
            onBack={() => setView("backtest")}
          />
        </div>
      )}

      {view === "evaluation" && evaluationJobId && (
        <EvaluationPanel
          key={evaluationJobId}
          jobId={evaluationJobId}
          onBack={() => setView("backtest")}
        />
      )}

      <footer className="page-footer">
        {/* <span>CALVIS® / INTERNAL SYSTEM</span>
        <span>TRACE OUTPUT IS NON-PRODUCTION</span> */}
        <span>REV 01.0.0</span>
      </footer>
    </main>
  );
}

function TheoParamsPreview({
  diagnosis,
  loading,
  error,
  selectedFindingId,
  replayStartTurn,
  replayEndTurn,
  onSelectFinding,
}: {
  diagnosis: DiagnoseResponse | null;
  loading: boolean;
  error: string | null;
  selectedFindingId: string;
  replayStartTurn: string;
  replayEndTurn: string;
  onSelectFinding: (findingId: string) => void;
}) {
  const findings = diagnosis ? allDiagnosisFindings(diagnosis) : [];

  if (loading) {
    return (
      <section className="candidate-review" aria-label="Theo params preview">
        <header>
          <div>
            <span className="candidate-review__kicker">THEO PARAMS</span>
            <h2>LOADING</h2>
          </div>
        </header>
      </section>
    );
  }

  if (error) {
    return (
      <section className="candidate-review" aria-label="Theo params preview">
        <header>
          <div>
            <span className="candidate-review__kicker">THEO PARAMS</span>
            <h2>FAILED</h2>
          </div>
          <strong data-status="rejected">ERROR</strong>
        </header>
        <p className="candidate-review__error" role="alert">{error}</p>
      </section>
    );
  }

  if (!diagnosis || findings.length === 0) {
    return null;
  }

  const expectedBehavior = expectedBehaviorForDiagnosis(diagnosis);

  return (
    <section className="candidate-review" aria-label="Theo params preview">
      <header>
        <div>
          <span className="candidate-review__kicker">THEO PARAMS</span>
          <h2>
            JOB {diagnosis.jobId} / REPLAY TURNS {replayStartTurn || "—"}-{replayEndTurn || "—"}
          </h2>
        </div>
        <strong data-status="rejected">SELECTED</strong>
      </header>
      <div className="candidate-review__grid">
        <section>
          <span>PATTERNS</span>
          <h3>{findings.length} TARGET{findings.length === 1 ? "" : "S"}</h3>
          <p>Pick one target to run. Each target gets its own Maya evaluation.</p>
        </section>
        <section>
          <span>EXPECTED BEHAVIOUR</span>
          <h3>MAYA TARGET</h3>
          <p>{expectedBehavior}</p>
        </section>
      </div>
      <div className="candidate-review__change">
        <small>THEO WILL RECEIVE</small>
        <div>
          {findings.map((finding) => (
            <section key={finding.id}>
              <span>{selectedFindingId === finding.id ? "SELECTED" : finding.id}</span>
              <p>
                <strong>{finding.title}</strong>
                <br />
                Diagnosis: {finding.diagnosis}
                <br />
                Maya target: {expectedBehaviorForFinding(finding)}
              </p>
              <small>
                Fix: {finding.suggestedFix}
                {finding.evidence.length > 0
                  ? ` / Evidence: ${finding.evidence.map((item) => item.ref).join(" · ")}`
                  : ""}
              </small>
              <div>
                <button
                  type="button"
                  className="candidate-review__accept"
                  disabled={selectedFindingId === finding.id}
                  onClick={() => onSelectFinding(finding.id)}
                >
                  {selectedFindingId === finding.id ? "TARGET SELECTED" : "SELECT TARGET"}
                </button>
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

function DiagnosisBacktestResult({
  state,
  result,
}: {
  state: PanelState;
  result: DiagnoseResponse | null;
}) {
  if (state.status === "idle") {
    return (
      <section className="candidate-review" aria-label="Diagnosis backtest">
        <header>
          <div>
            <span className="candidate-review__kicker">DIAGNOSIS</span>
            <h2>READY</h2>
          </div>
        </header>
        <div className="candidate-review__grid">
          <section>
            <span>STATUS</span>
            <h3>WAITING</h3>
            <p>Select a diagnosis run and execute the backtest.</p>
          </section>
        </div>
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section className="candidate-review" aria-label="Diagnosis backtest">
        <header>
          <div>
            <span className="candidate-review__kicker">DIAGNOSIS</span>
            <h2>RUNNING</h2>
          </div>
        </header>
        <div className="candidate-review__grid">
          <section>
            <span>STATUS</span>
            <h3>ANALYZING TRACE</h3>
            <p>Backtesting the selected diagnosis run against the recorded output.</p>
          </section>
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="candidate-review" aria-label="Diagnosis backtest">
        <header>
          <div>
            <span className="candidate-review__kicker">DIAGNOSIS</span>
            <h2>FAILED</h2>
          </div>
          <strong data-status="rejected">ERROR</strong>
        </header>
        <p className="candidate-review__error" role="alert">
          {state.error}
        </p>
      </section>
    );
  }

  if (!result) {
    return null;
  }

  const findingCount = result.llmFindings.length + result.patterns.length;

  return (
    <section className="candidate-review" aria-label="Diagnosis backtest">
      <header>
        <div>
          <span className="candidate-review__kicker">DIAGNOSIS</span>
          <h2>
            JOB {result.jobId} / TURNS {result.startTurn}-{result.endTurn}
          </h2>
        </div>
        <strong data-status={result.noFindings ? "accepted" : "rejected"}>
          {result.noFindings ? "CLEAR" : `${findingCount} FOUND`}
        </strong>
      </header>

      <div className="candidate-review__grid">
        <section>
          <span>RESULT</span>
          <h3>{result.noFindings ? "CLEAR" : "REVIEW"}</h3>
          <p>{result.summary}</p>
        </section>
        <section>
          <span>LENS</span>
          <h3>{result.lenses[0]?.name.toUpperCase() ?? "DIAGNOSIS"}</h3>
          <p>{result.lenses[0]?.description ?? "Selected diagnosis lens."}</p>
        </section>
      </div>

      <div className="candidate-review__change">
        <small>{result.runId}</small>
        <div>
          {result.evaluatorReports.map((report) => (
            <section key={report.evaluatorId}>
              <span>
                {report.findings.length} FINDING
                {report.findings.length === 1 ? "" : "S"}
              </span>
              <p>
                <strong>{report.evaluatorName}</strong>: {report.summary}
              </p>
              {report.findings.map((finding) => (
                <p key={finding.id}>
                  <strong>{finding.title}</strong> — {finding.diagnosis}
                </p>
              ))}
            </section>
          ))}
          {result.patterns.map((pattern) => (
            <section key={pattern.id}>
              <span>{pattern.severity.toUpperCase()}</span>
              <p>
                <strong>{pattern.title}</strong>: {pattern.diagnosis}
              </p>
            </section>
          ))}
        </div>
      </div>

      <footer>
        <p>{result.artifactDirectory}</p>
      </footer>
    </section>
  );
}

function contextFromSimulation(
  simulation: SimulationResponse | null,
): TheoContext | null {
  if (
    !simulation ||
    simulation.simulationNumber === undefined ||
    !Number.isSafeInteger(simulation.simulationNumber) ||
    simulation.simulationNumber < 1
  ) {
    return null;
  }

  return {
    simTarget: simulation.simulationNumber,
    startTurn: simulation.startTurn,
    endTurn: simulation.endTurn,
  };
}

function calloutForJob(jobId: string | null): string | null {
  if (jobId === "56370") {
    return "On job 56370 the guard said he'd walked the full site and checked both buildings. The copilot pushed back on him three times in four minutes and flagged him. Too hard for what it actually had.";
  }
  if (jobId === "50837") {
    return "On job 50837 the copilot went quiet after the first hour. It woke on schedule five times between 3am and 7am and sent nothing at all — no patrol report asked for, no check on the guard, all the way to the end of the shift.";
  }
  return null;
}

function sourceCoordinates(
  jobIdValue: string,
  startTurnValue: string,
  endTurnValue: string,
): Pick<OriginalRequest, "jobId" | "startTurn" | "endTurn"> | null {
  const jobId = jobIdValue.trim();
  const startTurn = Number(startTurnValue);
  const endTurn = Number(endTurnValue);
  if (
    !/^\d+$/.test(jobId) ||
    !Number.isInteger(startTurn) ||
    startTurn < 1 ||
    !Number.isInteger(endTurn) ||
    endTurn < startTurn
  ) {
    return null;
  }
  return { jobId, startTurn, endTurn };
}

function allDiagnosisFindings(diagnosis: DiagnoseResponse): DiagnosisFinding[] {
  return [...diagnosis.llmFindings, ...diagnosis.patterns];
}

function expectedBehaviorForFinding(finding: DiagnosisFinding): string {
  return (
    finding.expectedBehavior?.trim() ||
    `The candidate should resolve diagnosis ${finding.id}: ${finding.diagnosis}. It should follow this intended fix: ${finding.suggestedFix}`
  );
}

function expectedBehaviorForDiagnosis(diagnosis: DiagnoseResponse): string {
  return allDiagnosisFindings(diagnosis)
    .map((finding) => `${finding.id}: ${expectedBehaviorForFinding(finding)}`)
    .join("\n");
}

function diagnosisBacktestRequest(
  simulation: SimulationRequest,
  finding: DiagnosisFinding,
): BacktestRequest {
  const callout = [
    `Diagnosis ${finding.id}: ${finding.diagnosis}`,
    `Likely cause: ${finding.likelyCause}`,
    `Suggested fix: ${finding.suggestedFix}`,
  ].join("\n");
  return {
    ...simulation,
    replayMode: "candidate",
    callout,
    expectedBehavior: expectedBehaviorForFinding(finding),
    baselineSource: "shift",
  };
}

function backtestRequest(
  request: ParsedBacktest,
  sourceId: BacktestFormState["baselineSource"],
): BacktestRequest {
  if (sourceId === "shift") {
    return {
      ...request.simulation,
      callout: request.callout,
      expectedBehavior: request.expectedBehavior,
      baselineSource: "shift",
    };
  }
  return {
    ...request.simulation,
    callout: request.callout,
    expectedBehavior: request.expectedBehavior,
    baselineSource: "simulation",
    baselineSimulationNumber: Number(sourceId.slice("simulation:".length)),
  };
}

function originalRequest(
  request: SimulationRequest,
  sourceId: BacktestFormState["baselineSource"],
): OriginalRequest {
  if (sourceId === "shift") {
    return { ...request, source: "shift" };
  }
  return {
    ...request,
    source: "simulation",
    simulationNumber: Number(sourceId.slice("simulation:".length)),
  };
}

interface ParsedBacktest {
  simulation: SimulationRequest;
  callout: string;
  expectedBehavior: string;
}

function parseForm(
  form: BacktestFormState,
  selectedDiagnosisRun?: DiagnoseRunSummary,
): ParsedBacktest | string {
  const jobId = form.evaluate && selectedDiagnosisRun
    ? selectedDiagnosisRun.jobId
    : form.jobId.trim();
  const callout = form.callout.trim();
  const expectedBehavior = form.expectedBehavior.trim();
  const startTurn = Number(form.startTurn);
  const endTurn = Number(form.endTurn);

  if (form.evaluate && !selectedDiagnosisRun) {
    return "SELECT A DIAGNOSIS RUN.";
  }
  if (!/^\d+$/.test(jobId)) {
    return "JOB ID MUST CONTAIN DIGITS ONLY.";
  }
  if (!Number.isInteger(startTurn) || startTurn < 1) {
    return "START TURN MUST BE A POSITIVE INTEGER.";
  }
  if (!Number.isInteger(endTurn) || endTurn < 1) {
    return "END TURN MUST BE A POSITIVE INTEGER.";
  }
  if (startTurn > endTurn) {
    return "START TURN CANNOT EXCEED END TURN.";
  }
  if (!form.evaluate && !callout) {
    return "MAYA CALLOUT IS REQUIRED.";
  }
  if (!form.evaluate && !expectedBehavior) {
    return "EXPECTED BEHAVIOUR IS REQUIRED.";
  }
  if (!form.evaluate && form.replayMode !== "candidate") {
    return "NEW AGENT MODE MUST BE CANDIDATE FOR MAYA EVALUATION.";
  }

  return {
    callout,
    expectedBehavior: form.evaluate ? "Diagnosis-derived expected behavior" : expectedBehavior,
    simulation: {
      jobId,
      startTurn,
      endTurn,
      replayMode: form.evaluate ? "candidate" : form.replayMode,
      debug: form.debug,
      callNiko: form.callNiko,
      useCompactContext: form.useCompactContext,
    },
  };
}

async function loadOriginalPanel(
  request: Promise<SimulationResponse>,
  setPanel: (state: PanelState) => void,
  signal: AbortSignal,
): Promise<SimulationResponse | null> {
  try {
    const data = await request;
    if (!signal.aborted) {
      setPanel({ status: "success", data, error: null });
      return data;
    }
  } catch (error: unknown) {
    if (!signal.aborted) {
      setPanel({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return null;
}
