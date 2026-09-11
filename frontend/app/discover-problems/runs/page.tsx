"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

interface DiagnoseRunSummary {
  runId: string;
  artifactDirectory: string;
  jobId: string;
  startTurn: number;
  endTurn: number;
  summary: string;
  findingCount: number;
  createdAt?: string;
}

interface DiagnoseRunsResponse {
  runs: DiagnoseRunSummary[];
}

export default function DiagnoseRunsPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [runs, setRuns] = useState<DiagnoseRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRuns() {
      setStatus("loading");
      setError(null);
      try {
        const response = await fetch("/api/diagnose/runs", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await errorMessage(response, "Failed to load diagnosis runs"));
        }
        const payload: unknown = await response.json();
        if (!isDiagnoseRunsResponse(payload)) {
          throw new Error("Diagnosis runs API returned an invalid response.");
        }
        if (!cancelled) {
          setRuns(payload.runs);
          setStatus("success");
        }
      } catch (caught: unknown) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setStatus("error");
        }
      }
    }

    void loadRuns();
    return () => {
      cancelled = true;
    };
  }, []);

  const titledRuns = useMemo(() => titleRuns(runs), [runs]);

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
            RUN<span>/</span>S
          </h1>
        </div>
        <p>
          Saved diagnosis history from production trace discovery. Each card is a
          local diagnosis artifact that can be selected later for backtest evaluation.
        </p>
      </section>

      <section className="candidate-review" aria-label="Diagnosis runs history">
        <header>
          <div>
            <span className="candidate-review__kicker">DISCOVER PROBLEMS</span>
            <h2>RUN HISTORY</h2>
          </div>
          <strong data-status={status === "error" ? "rejected" : "accepted"}>
            {status === "loading" ? "LOADING" : status === "error" ? "ERROR" : `${runs.length} RUNS`}
          </strong>
        </header>

        {error && <p className="comparison-status candidate-review__error">{error}</p>}

        <div className="candidate-review__change theo-receive-panel">
          <div className="theo-receive-panel__header">
            <small>SAVED DIAGNOSES</small>
            <span>{status === "success" ? `${runs.length} total` : status}</span>
          </div>

          {status === "loading" && (
            <div>
              <section className="theo-target-card diagnose-pattern-card">
                <div className="theo-target-card__details">
                  <LabeledText label="Status">Loading diagnosis runs.</LabeledText>
                </div>
              </section>
            </div>
          )}

          {status === "success" && titledRuns.length === 0 && (
            <div>
              <section className="theo-target-card diagnose-pattern-card">
                <div className="theo-target-card__details">
                  <LabeledText label="Status">No diagnosis runs have been saved yet.</LabeledText>
                </div>
              </section>
            </div>
          )}

          {status === "success" && titledRuns.length > 0 && (
            <div>
              {titledRuns.map(({ run, title }) => (
                <section className="theo-target-card diagnose-pattern-card" key={run.runId}>
                  <Link
                    className="theo-target-card__summary diagnose-run-card__summary"
                    href={`/discover-problems?runId=${encodeURIComponent(run.runId)}`}
                  >
                    <span className="diagnose-run-card__id">{run.runId}</span>
                    <strong>{title}</strong>
                    <span className="diagnose-pattern-card__badges">
                      <em data-confidence="true">{run.findingCount} findings</em>
                    </span>
                  </Link>
                  <div className="theo-target-card__details">
                    <LabeledText label="Trace window">
                      JOB {run.jobId} / TURNS {run.startTurn}-{run.endTurn}
                    </LabeledText>
                    <LabeledText label="Summary">{run.summary}</LabeledText>
                    <LabeledText label="Created">{formatCreatedAt(run.createdAt)}</LabeledText>
                    <LabeledText label="Artifact directory">{run.artifactDirectory}</LabeledText>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="page-footer">
        <span>REV 01.0.0</span>
      </footer>
    </main>
  );
}

function titleRuns(runs: DiagnoseRunSummary[]): Array<{ run: DiagnoseRunSummary; title: string }> {
  const orderedByJob = new Map<string, DiagnoseRunSummary[]>();
  for (const run of runs) {
    orderedByJob.set(run.jobId, [...(orderedByJob.get(run.jobId) ?? []), run]);
  }

  const ordinals = new Map<string, number>();
  for (const jobRuns of orderedByJob.values()) {
    [...jobRuns]
      .sort((left, right) => timestamp(left.createdAt) - timestamp(right.createdAt))
      .forEach((run, index) => ordinals.set(run.runId, index + 1));
  }

  return runs.map((run) => ({
    run,
    title: `J_${run.jobId}-#${ordinals.get(run.runId) ?? 1}`,
  }));
}

function timestamp(value?: string): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatCreatedAt(value?: string): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function LabeledText({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="theo-labeled-text">
      <strong>{label}</strong>
      <p>{children}</p>
    </div>
  );
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

function isDiagnoseRunsResponse(value: unknown): value is DiagnoseRunsResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as DiagnoseRunsResponse).runs) &&
      (value as DiagnoseRunsResponse).runs.every(isDiagnoseRunSummary),
  );
}

function isDiagnoseRunSummary(value: unknown): value is DiagnoseRunSummary {
  const candidate = value as DiagnoseRunSummary;
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof candidate.runId === "string" &&
      typeof candidate.artifactDirectory === "string" &&
      typeof candidate.jobId === "string" &&
      typeof candidate.startTurn === "number" &&
      typeof candidate.endTurn === "number" &&
      typeof candidate.summary === "string" &&
      typeof candidate.findingCount === "number",
  );
}
