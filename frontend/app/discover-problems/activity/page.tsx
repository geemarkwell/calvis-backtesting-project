"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type QueueStatus = "queued" | "running" | "completed" | "failed";
type ActivityTab = "all" | QueueStatus;

interface DiagnosisQueueItem {
  id: string;
  jobId: string;
  status: QueueStatus;
  reason: string;
  requestedBy: string;
  replaySource: "production";
  scope: "full-job";
  sourceSessionId: string | null;
  diagnosisRunId: string | null;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface DiagnosisQueueResponse {
  items: DiagnosisQueueItem[];
  count: number;
}

const ACTIVITY_TABS: ActivityTab[] = ["all", "queued", "running", "completed", "failed"];
const PAGE_SIZE = 10;

export default function DiagnosisActivityPage() {
  const [activeQueueStatus, setActiveQueueStatus] = useState<ActivityTab>("all");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [items, setItems] = useState<DiagnosisQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning">("idle");
  const [page, setPage] = useState(0);

  const loadQueue = useCallback(async (signal?: AbortSignal) => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(`/api/diagnose/queue${activeQueueStatus === "all" ? "" : `?status=${activeQueueStatus}`}`, { cache: "no-store", signal });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "Failed to load diagnosis queue"));
      }
      const payload: unknown = await response.json();
      if (!isDiagnosisQueueResponse(payload)) {
        throw new Error("Diagnosis queue API returned an invalid response.");
      }
      setItems(payload.items);
      setStatus("success");
    } catch (caught: unknown) {
      if (!signal?.aborted) {
        setError(caught instanceof Error ? caught.message : String(caught));
        setStatus("error");
      }
    }
  }, [activeQueueStatus]);

  useEffect(() => {
    const controller = new AbortController();
    void loadQueue(controller.signal);
    return () => controller.abort();
  }, [loadQueue]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const visibleItems = useMemo(
    () => items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [items, page],
  );

  useEffect(() => {
    setPage(0);
  }, [activeQueueStatus]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  async function scan() {
    setScanStatus("scanning");
    setError(null);
    try {
      const response = await fetch("/api/diagnose/queue/sweep-start", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await errorMessage(response, "Diagnosis queue scan failed"));
      }
      await loadQueue();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    } finally {
      setScanStatus("idle");
    }
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
          <h1>
            ACT<span>/</span>IVITY
          </h1>
        </div>
        <p>Production jobs moving through automated diagnosis activity.</p>
      </section>

      <section className="candidate-review" aria-label="Diagnosis activity">
        <header>
          <div>
            <span className="candidate-review__kicker">DISCOVER PROBLEMS</span>
            <h2>DIAGNOSIS ACTIVITY</h2>
          </div>
          <strong>
            {status === "loading" ? "LOADING" : status === "error" ? "ERROR" : `${items.length} ${activeQueueStatus.toUpperCase()}`}
          </strong>
        </header>

        {error && <p className="comparison-status candidate-review__error">{error}</p>}

        <div className="diagnosis-activity-toolbar">
          <div className="diagnose-tabs" role="tablist" aria-label="Diagnosis activity status">
            {ACTIVITY_TABS.map((queueStatus) => (
              <button
                type="button"
                data-active={activeQueueStatus === queueStatus}
                onClick={() => setActiveQueueStatus(queueStatus)}
                key={queueStatus}
              >
                {queueStatus.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="diagnosis-activity-scan-button"
            disabled={scanStatus === "scanning"}
            onClick={scan}
          >
            {scanStatus === "scanning" ? "SCANNING" : "SCAN"}
          </button>
        </div>

        <div className="candidate-review__change theo-receive-panel">
          <div className="theo-receive-panel__header">
            <small>{activeQueueStatus.toUpperCase()} DIAGNOSES</small>
            <span>{status === "success" ? `${items.length} total` : status}</span>
          </div>

          {status === "loading" && (
            <div>
              <section className="theo-target-card diagnose-pattern-card">
                <div className="theo-target-card__details">
                  <LabeledText label="Status">Loading diagnosis queue.</LabeledText>
                </div>
              </section>
            </div>
          )}

          {status === "success" && items.length === 0 && (
            <div>
              <section className="theo-target-card diagnose-pattern-card">
                <div className="theo-target-card__details">
                  <LabeledText label="Status">No jobs are currently queued.</LabeledText>
                </div>
              </section>
            </div>
          )}

          {status === "success" && items.length > 0 && (
            <div>
              {visibleItems.map((item) => (
                <section className="theo-target-card diagnose-pattern-card" key={item.id}>
                  <QueueItemSummary item={item} />
                  {item.errorMessage && (
                    <div className="theo-target-card__details">
                      <LabeledText label="Error">{item.errorMessage}</LabeledText>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}

          {status === "success" && items.length > PAGE_SIZE && (
            <div className="theo-target-pagination" aria-label="Diagnosis activity pagination">
              {Array.from({ length: totalPages }, (_, index) => (
                <button
                  type="button"
                  data-active={page === index}
                  onClick={() => setPage(index)}
                  key={index}
                >
                  {index + 1}
                </button>
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

function QueueItemSummary({ item }: { item: DiagnosisQueueItem }) {
  const content = (
    <>
      <ActivityCell label="ID" value={item.id} />
      <ActivityCell label="Job" value={`J_${item.jobId}`} strong />
      <ActivityCell label="Trace window" value="FULL JOB" />
      <ActivityCell label="Queued at" value={formatDate(item.queuedAt)} />
      <ActivityCell label="Completed at" value={completionValue(item)} />
      <ActivityCell label="Requested by" value={requesterLabel(item.requestedBy)} />
      <div className="diagnosis-activity-cell diagnose-queue-status">
        <span>Status</span>
        <em data-status={item.status}>{statusLabel(item.status)}</em>
      </div>
    </>
  );
  if (item.status === "completed" && item.diagnosisRunId) {
    return (
      <Link
        className="theo-target-card__summary diagnose-run-card__summary diagnosis-activity-row"
        href={`/discover-problems?runId=${encodeURIComponent(item.diagnosisRunId)}`}
      >
        {content}
      </Link>
    );
  }
  return <div className="theo-target-card__summary diagnose-run-card__summary diagnosis-activity-row">{content}</div>;
}

function ActivityCell({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="diagnosis-activity-cell">
      <span>{label}</span>
      {strong ? <strong>{value}</strong> : <p>{value}</p>}
    </div>
  );
}

function completionValue(item: DiagnosisQueueItem): string {
  if (item.completedAt) return formatDate(item.completedAt);
  if (item.status === "running") return "Running";
  if (item.status === "failed") return "Failed";
  return "Waiting";
}

function requesterLabel(value: string): string {
  return /manual|human/i.test(value) ? "Human" : "System";
}

function statusLabel(status: QueueStatus): string {
  if (status === "running") return "diagnosing";
  if (status === "failed") return "failed";
  if (status === "completed") return "completed";
  return "waiting";
}

function formatDate(value?: string | null): string {
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

function isDiagnosisQueueResponse(value: unknown): value is DiagnosisQueueResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as DiagnosisQueueResponse).items) &&
      typeof (value as DiagnosisQueueResponse).count === "number" &&
      (value as DiagnosisQueueResponse).items.every(isDiagnosisQueueItem),
  );
}

function isDiagnosisQueueItem(value: unknown): value is DiagnosisQueueItem {
  const item = value as DiagnosisQueueItem;
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof item.id === "string" &&
      typeof item.jobId === "string" &&
      ["queued", "running", "completed", "failed"].includes(item.status) &&
      typeof item.reason === "string" &&
      typeof item.requestedBy === "string" &&
      typeof item.queuedAt === "string",
  );
}
