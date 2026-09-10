"use client";

import { useRef, useState } from "react";

interface DiagnoseEvidence {
  ref: string;
  turn?: number;
  timestamp?: string;
  summary: string;
}

interface DiagnosePattern {
  id: string;
  title: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  diagnosis: string;
  likelyCause: string;
  suggestedFix: string;
  evidence: DiagnoseEvidence[];
}

interface DiagnoseResponse {
  runId: string;
  artifactDirectory: string;
  jobId: string;
  startTurn: number;
  endTurn: number;
  summary: string;
  patterns: DiagnosePattern[];
  llmFindings: DiagnosePattern[];
  noFindings: boolean;
}

const INITIAL_FORM = {
  jobId: "",
  startTurn: "",
  endTurn: "",
};

export default function DiscoverProblemsPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<DiagnoseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  async function discover() {
    const parsed = parseForm(form);
    if (typeof parsed === "string") {
      setError(parsed);
      setStatus("error");
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("loading");
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "Diagnose failed"));
      }
      const payload: unknown = await response.json();
      if (!isDiagnoseResponse(payload)) {
        throw new Error("Diagnose API returned an invalid response.");
      }
      if (controller.signal.aborted) {
        return;
      }
      setResult(payload);
      setStatus("success");
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setStatus("error");
      }
    }
  }

  const busy = status === "loading";

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
          <h1>
            DISC<span>/</span>OVER
          </h1>
        </div>
        <p>
          Analyze a bounded production trace when you do not already know the
          failure. CIE ranks tool, behavior, recovery, and safety patterns with
          evidence-backed suggested fixes.
        </p>
      </section>

      <section className="control-deck" aria-label="Discover problems controls">
        <div className="control-deck__header">
          <div>
            <span className="eyebrow">DISCOVER PROBLEMS</span>
            <h2>TRACE COORDINATES</h2>
          </div>
          <span className="endpoint-readout">POST /diagnose/discover</span>
        </div>
        <div className="control-grid">
          <label className="field field--job">
            <span>JOB ID</span>
            <input
              value={form.jobId}
              placeholder="56370"
              inputMode="numeric"
              onChange={(event) =>
                setForm((current) => ({ ...current, jobId: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>START TURN</span>
            <input
              value={form.startTurn}
              placeholder="9"
              inputMode="numeric"
              onChange={(event) =>
                setForm((current) => ({ ...current, startTurn: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>END TURN</span>
            <input
              value={form.endTurn}
              placeholder="16"
              inputMode="numeric"
              onChange={(event) =>
                setForm((current) => ({ ...current, endTurn: event.target.value }))
              }
            />
          </label>
          <button
            type="button"
            className="execute-button"
            disabled={busy}
            onClick={() => void discover()}
          >
            <span>{busy ? "ANALYZING" : "DISCOVER PROBLEMS"}</span>
            <span>↵</span>
          </button>
        </div>
        {error && <p className="comparison-status candidate-review__error">{error}</p>}
      </section>

      <DiagnoseResult status={status} result={result} />

      <footer className="page-footer">
        <span>REV 01.0.0</span>
      </footer>
    </main>
  );
}

function DiagnoseResult({
  status,
  result,
}: {
  status: "idle" | "loading" | "success" | "error";
  result: DiagnoseResponse | null;
}) {
  if (status === "idle") {
    return <StatusPanel title="READY" body="Enter a job and turn range to scan for unknown failure patterns." />;
  }
  if (status === "loading") {
    return <StatusPanel title="RUNNING" body="Normalizing the trace window and ranking diagnostic signals." />;
  }
  if (!result) {
    return <StatusPanel title="FAILED" body="The diagnostic run did not complete." rejected />;
  }

  return (
    <section className="candidate-review" aria-label="Diagnose result">
      <header>
        <div>
          <span className="candidate-review__kicker">DISCOVERED PATTERNS</span>
          <h2>
            JOB {result.jobId} / TURNS {result.startTurn}-{result.endTurn}
          </h2>
        </div>
        <strong data-status={result.noFindings ? "accepted" : "rejected"}>
          {result.noFindings ? "CLEAR" : `${result.patterns.length} FOUND`}
        </strong>
      </header>

      <div className="candidate-review__grid">
        <section>
          <span>SUMMARY</span>
          <h3>{result.noFindings ? "NO FINDINGS" : "REVIEW REQUIRED"}</h3>
          <p>{result.summary}</p>
        </section>
        <section>
          <span>ARTIFACTS</span>
          <h3>{result.runId}</h3>
          <p>{result.artifactDirectory}</p>
        </section>
      </div>

      <div className="candidate-review__change">
        <small>LLM FINDINGS — RANKED BY SEVERITY + CONFIDENCE</small>
        <div>
          {result.llmFindings.map((pattern) => (
            <section key={pattern.id}>
              <span>
                {pattern.severity} / {Math.round(pattern.confidence * 100)}%
              </span>
              <p>
                <strong>{pattern.title}</strong>
                <br />
                {pattern.diagnosis}
              </p>
              <p>{pattern.likelyCause}</p>
              <p>{pattern.suggestedFix}</p>
              {pattern.evidence.length > 0 && (
                <small>
                  {pattern.evidence
                    .map((item) => `${item.ref}: ${item.summary}`)
                    .join(" | ")}
                </small>
              )}
            </section>
          ))}
        </div>
      </div>

      {result.patterns.length > 0 && (
        <div className="candidate-review__change">
          <small>DETERMINISTIC SIGNALS</small>
          <div>
            {result.patterns.map((pattern) => (
              <section key={pattern.id}>
                <span>
                  {pattern.severity} / {Math.round(pattern.confidence * 100)}%
                </span>
                <p>
                  <strong>{pattern.title}</strong>
                  <br />
                  {pattern.diagnosis}
                </p>
                {pattern.evidence.length > 0 && (
                  <small>
                    {pattern.evidence
                      .map((item) => `${item.ref}: ${item.summary}`)
                      .join(" | ")}
                  </small>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StatusPanel({
  title,
  body,
  rejected = false,
}: {
  title: string;
  body: string;
  rejected?: boolean;
}) {
  return (
    <section className="candidate-review" aria-label="Diagnose status">
      <header>
        <div>
          <span className="candidate-review__kicker">DISCOVER PROBLEMS</span>
          <h2>{title}</h2>
        </div>
        {rejected && <strong data-status="rejected">ERROR</strong>}
      </header>
      <div className="candidate-review__grid">
        <section>
          <span>STATUS</span>
          <h3>{title}</h3>
          <p>{body}</p>
        </section>
      </div>
    </section>
  );
}

function parseForm(form: typeof INITIAL_FORM):
  | { jobId: string; startTurn: number; endTurn: number }
  | string {
  const jobId = form.jobId.trim();
  const startTurn = Number(form.startTurn);
  const endTurn = Number(form.endTurn);
  if (!/^\d+$/.test(jobId)) return "Enter a numeric job ID.";
  if (!Number.isInteger(startTurn) || startTurn < 1) return "Start turn must be a positive integer.";
  if (!Number.isInteger(endTurn) || endTurn < 1) return "End turn must be a positive integer.";
  if (startTurn > endTurn) return "Start turn cannot be greater than end turn.";
  return { jobId, startTurn, endTurn };
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && "message" in payload) {
      const message = (payload as { message?: unknown }).message;
      return Array.isArray(message) ? message.join("; ") : String(message);
    }
  } catch {
    // Response was not JSON.
  }
  return `${fallback} (${response.status})`;
}

function isDiagnoseResponse(value: unknown): value is DiagnoseResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as DiagnoseResponse).runId === "string" &&
      typeof (value as DiagnoseResponse).jobId === "string" &&
      Array.isArray((value as DiagnoseResponse).patterns) &&
      Array.isArray((value as DiagnoseResponse).llmFindings),
  );
}
