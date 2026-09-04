"use client";

import { useEffect, useRef, useState, type UIEvent } from "react";
import {
  getOriginalCopilot,
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

const INITIAL_FORM: BacktestFormState = {
  jobId: "",
  callout: "",
  expectedBehavior: "",
  startTurn: "",
  endTurn: "",
  baselineSource: "shift",
  replayMode: "candidate",
  debug: false,
  callNiko: false,
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
  const [backtestResult, setBacktestResult] = useState<BacktestResponse | null>(
    null,
  );
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
    setBaselineOptions(DEFAULT_BASELINE_OPTIONS);
    setBaselineOptionsLoading(
      Boolean(sourceCoordinates(next.jobId, next.startTurn, next.endTurn)),
    );
  }

  async function executeBacktest() {
    const parsed = parseForm(form);
    if (typeof parsed === "string") {
      setValidationError(parsed);
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setValidationError(null);
    setBacktestResult(null);
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
          theoAvailable={theoContext !== null}
          evaluationAvailable={evaluationJobId !== null}
          onChange={updateForm}
          onSubmit={() => void executeBacktest()}
          onTheo={() => setView("theo")}
          onEvaluation={() => setView("evaluation")}
        />

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

        {backtestResult && (
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

function parseForm(form: BacktestFormState): ParsedBacktest | string {
  const jobId = form.jobId.trim();
  const callout = form.callout.trim();
  const expectedBehavior = form.expectedBehavior.trim();
  const startTurn = Number(form.startTurn);
  const endTurn = Number(form.endTurn);

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
  if (!callout) {
    return "MAYA CALLOUT IS REQUIRED.";
  }
  if (!expectedBehavior) {
    return "EXPECTED BEHAVIOUR IS REQUIRED.";
  }
  if (form.replayMode !== "candidate") {
    return "NEW AGENT MODE MUST BE CANDIDATE FOR MAYA EVALUATION.";
  }

  return {
    callout,
    expectedBehavior,
    simulation: {
      jobId,
      startTurn,
      endTurn,
      replayMode: form.replayMode,
      debug: form.debug,
      callNiko: form.callNiko,
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
