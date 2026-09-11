"use client";

import { useEffect, useRef, useState } from "react";

interface DiagnoseEvidence {
  ref: string;
  turn?: number;
  timestamp?: string;
  summary: string;
}

interface DiagnoseMessageEvidence {
  ref: string;
  turn?: number;
  timestamp?: string;
  role: "guard" | "copilot" | "tool" | "system";
  speaker: string;
  message: string;
  reasoning: string;
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
  messages?: DiagnoseMessageEvidence[];
}

interface DiagnoseToolCall {
  ref: string;
  tool: string;
  turn?: number;
  timestamp?: string;
  ok?: boolean | null;
  error?: string | null;
  inputPreview: string;
  outputPreview?: string;
}

interface DiagnoseToolSummary {
  tool: string;
  count: number;
  failures: number;
}

interface DiagnoseLens {
  id: string;
  name: string;
  description: string;
  focusAreas: string[];
  exclusions: string[];
}

interface DiagnoseEvaluatorReport {
  evaluatorId: string;
  evaluatorName: string;
  summary: string;
  findings: DiagnosePattern[];
  lens?: DiagnoseLens;
}

interface DiagnoseResponse {
  runId: string;
  artifactDirectory: string;
  jobId: string;
  startTurn: number;
  endTurn: number;
  summary: string;
  lenses: DiagnoseLens[];
  patterns: DiagnosePattern[];
  llmFindings: DiagnosePattern[];
  evaluatorReports: DiagnoseEvaluatorReport[];
  toolCalls: DiagnoseToolCall[];
  toolSummary: DiagnoseToolSummary[];
  noFindings: boolean;
}

const INITIAL_FORM = {
  jobId: "",
  startTurn: "",
  endTurn: "",
  replaySource: "production" as const,
};

const DIAGNOSE_PROGRESS_LENSES = [
  { id: "task-success", name: "Task Success", description: "Outcome and false-success claims" },
  { id: "tool-use", name: "Tool Use", description: "Selection, arguments, errors, recovery" },
  { id: "context", name: "Context", description: "Missing, stale, or overloaded evidence" },
  { id: "safety-recovery", name: "Safety + Recovery", description: "Boundaries, ambiguity, escalation" },
  { id: "prompt-issue", name: "Prompt Issue", description: "Prompt-rooted causes and exact edits" },
  { id: "free-agent", name: "Free Agent", description: "Other loopholes and cross-lens risks" },
];

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
          <label className="field">
            <span>REPLAY SOURCE</span>
            <input value="PRODUCTION DATA" disabled readOnly />
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
  const [activeTab, setActiveTab] = useState<"findings" | "tools" | "messages">("findings");
  if (status === "idle") {
    return <StatusPanel title="READY" body="Enter a job and turn range to scan for unknown failure patterns." />;
  }
  if (status === "loading") {
    return <DiagnoseProgressPanel />;
  }
  if (!result) {
    return <StatusPanel title="FAILED" body="The diagnostic run did not complete." rejected />;
  }

  const llmPatternItems = result.evaluatorReports.flatMap((report) =>
    report.findings.map((finding) => ({
      pattern: finding,
      source: report.evaluatorName,
      summary: report.summary,
    })),
  );
  const deterministicPatternItems = result.patterns.map((pattern) => ({
    pattern,
    source: "Deterministic analyzer",
  }));

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
          {result.noFindings ? "CLEAR" : `${result.llmFindings.length + result.patterns.length} FOUND`}
        </strong>
      </header>

      <div className="candidate-review__grid">
        <section>
          <span>SUMMARY</span>
          <h3>{result.noFindings ? "NO FINDINGS" : "REVIEW REQUIRED"}</h3>
          <p>{result.summary}</p>
          {result.lenses.length > 0 && (
            <small>
              LENSES: {result.lenses.map((lens) => lens.name).join(" / ")}
            </small>
          )}
        </section>
        <section>
          <span>ARTIFACTS</span>
          <h3>{result.runId}</h3>
          <p>{result.artifactDirectory}</p>
        </section>
      </div>

      <div className="diagnose-tabs" role="tablist" aria-label="Diagnose result tabs">
        <button
          type="button"
          data-active={activeTab === "findings"}
          onClick={() => setActiveTab("findings")}
        >
          FINDINGS
        </button>
        <button
          type="button"
          data-active={activeTab === "tools"}
          onClick={() => setActiveTab("tools")}
        >
          TOOLS ({result.toolCalls.length})
        </button>
        <button
          type="button"
          data-active={activeTab === "messages"}
          onClick={() => setActiveTab("messages")}
        >
          MESSAGES ({result.llmFindings.length + result.patterns.length})
        </button>
      </div>

      {activeTab === "findings" && (
        <>
          <PaginatedPatternCards
            title="SPECIALIZED LLM FINDINGS"
            emptyCopy="No specialized LLM findings were returned."
            patterns={llmPatternItems}
          />

          {result.patterns.length > 0 && (
            <PaginatedPatternCards
              title="DETERMINISTIC SIGNALS"
              patterns={deterministicPatternItems}
            />
          )}
        </>
      )}

      {activeTab === "tools" && <ToolsTab result={result} />}

      {activeTab === "messages" && (
        <>
          <PaginatedPatternCards
            title="SPECIALIZED LLM MESSAGES"
            emptyCopy="No specialized LLM findings were returned."
            patterns={llmPatternItems}
            detailMode="messages"
          />

          {deterministicPatternItems.length > 0 && (
            <PaginatedPatternCards
              title="DETERMINISTIC SIGNAL MESSAGES"
              patterns={deterministicPatternItems}
              detailMode="messages"
            />
          )}
        </>
      )}
    </section>
  );
}

function PaginatedPatternCards({
  title,
  patterns,
  emptyCopy = "No findings returned.",
  detailMode = "details",
}: {
  title: string;
  patterns: Array<{
    pattern: DiagnosePattern;
    source: string;
    summary?: string;
  }>;
  emptyCopy?: string;
  detailMode?: "details" | "messages";
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(patterns.length / pageSize));
  const visiblePatterns = patterns.slice(page * pageSize, page * pageSize + pageSize);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  return (
    <div className="candidate-review__change theo-receive-panel">
      <div className="theo-receive-panel__header">
        <small>{title}</small>
        <span>
          {patterns.length === 0
            ? "0 of 0"
            : `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, patterns.length)} of ${patterns.length}`}
        </span>
      </div>

      {patterns.length === 0 ? (
        <div>
          <section className="theo-target-card diagnose-pattern-card">
            <div className="theo-target-card__details">
              <LabeledText label="Status">{emptyCopy}</LabeledText>
            </div>
          </section>
        </div>
      ) : (
        <div>
          {visiblePatterns.map(({ pattern, source, summary }) => {
            const expanded = expandedId === pattern.id;
            return (
              <section
                className={expanded ? "theo-target-card diagnose-pattern-card is-expanded" : "theo-target-card diagnose-pattern-card"}
                key={`${source}-${pattern.id}`}
              >
                <button
                  type="button"
                  className="theo-target-card__summary diagnose-pattern-card__summary"
                  onClick={() =>
                    setExpandedId((current) => current === pattern.id ? null : pattern.id)
                  }
                  aria-expanded={expanded}
                >
                  <span>{pattern.id}</span>
                  <strong>{pattern.title}</strong>
                  <span className="diagnose-pattern-card__badges">
                    <em data-confidence="true">{Math.round(pattern.confidence * 100)}%</em>
                  </span>
                  <small>{expanded ? (detailMode === "messages" ? "Hide message" : "Hide details") : (detailMode === "messages" ? "View message" : "View details")}</small>
                </button>

                {expanded && (
                  <PatternCardDetails
                    pattern={pattern}
                    source={source}
                    summary={summary}
                    mode={detailMode}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}

      {patterns.length > pageSize && (
        <div className="theo-target-pagination" aria-label={`${title} pagination`}>
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
  );
}

function PatternCardDetails({
  pattern,
  source,
  summary,
  mode,
}: {
  pattern: DiagnosePattern;
  source: string;
  summary?: string;
  mode: "details" | "messages";
}) {
  const evidenceText = pattern.evidence.length > 0
    ? pattern.evidence.map((item) => `${item.ref}: ${item.summary}`).join("\n")
    : "No direct message evidence was attached to this finding.";

  if (mode === "messages") {
    return (
      <div className="theo-target-card__details">
        <div className="diagnose-message-meta-row">
          <span className="diagnose-pattern-card__urgency" data-severity={pattern.severity}>
            {pattern.severity.toUpperCase()}
          </span>
          <span className="diagnose-message-meta-row__lens">{source}</span>
        </div>
        <MessageEvidenceBubbles pattern={pattern} fallbackEvidence={evidenceText} />
        <LabeledText label="Expected correction" emphasized="info">{pattern.suggestedFix}</LabeledText>
      </div>
    );
  }

  return (
    <div className="theo-target-card__details">
      <span className="diagnose-pattern-card__urgency" data-severity={pattern.severity}>
        {pattern.severity.toUpperCase()}
      </span>
      <LabeledText label="Evaluator" emphasized="pink">{source}</LabeledText>
      {summary && <LabeledText label="Evaluator summary">{summary}</LabeledText>}
      <LabeledText label="Diagnosis">{pattern.diagnosis}</LabeledText>
      <LabeledText label="Why" emphasized="warning">{pattern.likelyCause}</LabeledText>
      <LabeledText label="Fix" emphasized="info">{pattern.suggestedFix}</LabeledText>
      {pattern.evidence.length > 0 && (
        <LabeledText label="Evidence" scrollable>{evidenceText}</LabeledText>
      )}
    </div>
  );
}

function MessageEvidenceBubbles({
  pattern,
}: {
  pattern: DiagnosePattern;
  fallbackEvidence: string;
}) {
  const messages = pattern.messages ?? [];
  if (!messages.length) {
    return (
      <div className="diagnose-message-disclaimer">
        <strong>DISCLAIMER</strong>
        <p>Couldn&apos;t load messages.</p>
      </div>
    );
  }
  return (
    <div className="diagnose-message-evidence">
      <strong>Message evidence</strong>
      <div className="diagnose-message-evidence__stack">
        {messages.map((message, index) => (
          <article
            className={`diagnose-message-bubble diagnose-message-bubble--${message.role}`}
            key={`${message.ref}-${index}`}
          >
            <header>
              <span>{message.speaker}</span>
              <small>
                {message.turn ? `Turn ${message.turn}` : message.ref}
                {message.timestamp ? ` · ${formatDiagnoseTime(message.timestamp)}` : ""}
              </small>
            </header>
            <p>{message.message}</p>
            <details className="diagnose-message-reasoning">
              <summary>REASONING</summary>
              <p>{message.reasoning}</p>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}

function formatDiagnoseTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function LabeledText({
  label,
  children,
  emphasized,
  scrollable = false,
}: {
  label: string;
  children: string;
  emphasized?: "warning" | "info" | "pink";
  scrollable?: boolean;
}) {
  return (
    <div
      className={`theo-labeled-text${
        emphasized ? ` theo-labeled-text--${emphasized}` : ""
      }${scrollable ? " theo-labeled-text--scrollable" : ""}`}
    >
      <strong>{label}</strong>
      <p>{children}</p>
    </div>
  );
}

function ToolsTab({ result }: { result: DiagnoseResponse }) {
  const expectedTools = [
    "Read",
    "Grep",
    "Glob",
    "get_guard_locations",
    "get_job_logs",
    "get_job_chat_messages",
    "get_job_incidents",
    "get_site_history",
    "get_guard_status",
    "get_open_obligations",
    "request_copilot_dm",
    "add_copilot_note",
    "create_copilot_task",
    "flag_copilot_guard",
    "escalate_to_human",
    "escalate_to_ops",
  ];
  const summaryByTool = new Map(result.toolSummary.map((item) => [item.tool, item]));

  return (
    <div className="candidate-review__change diagnose-tools">
      <small>TOOLS CALLED IN TRACE WINDOW</small>
      <div>
        <section>
          <span>SUMMARY</span>
          <p>
            <strong>{result.toolCalls.length} TOOL CALLS</strong>
            <br />
            Search, Read, Glob, MCP reads, and side-effect tools are listed here
            when present in the trace. Missing tools stay at zero for future
            integrations.
          </p>
        </section>
        <section>
          <span>TOOL INVENTORY</span>
          <div className="diagnose-tool-inventory">
            {expectedTools.map((tool) => {
              const item = summaryByTool.get(tool);
              return (
                <span key={tool} data-empty={!item || item.count === 0}>
                  {tool} ×{item?.count ?? 0}
                  {item?.failures ? ` / ${item.failures} fail` : ""}
                </span>
              );
            })}
          </div>
        </section>
        <section className="diagnose-tool-list">
          <span>CALL LOG</span>
          {result.toolCalls.length === 0 ? (
            <p>No tool calls were recorded in this selected window.</p>
          ) : (
            result.toolCalls.map((call) => (
              <details key={call.ref} className="diagnose-tool-call">
                <summary>
                  <span className="diagnose-tool-call__name">{call.tool}</span>
                  <span className="diagnose-tool-call__preview">
                    {call.inputPreview.slice(0, 150)}
                  </span>
                  <span className="diagnose-tool-call__meta">
                    {call.ref}{call.turn ? ` / turn ${call.turn}` : ""}
                    {call.ok === false || call.error ? " / failed" : ""}
                  </span>
                </summary>
                <div className="diagnose-tool-detail">
                  <span>SENT</span>
                  <pre>{call.inputPreview}</pre>
                  <span>ANSWERED</span>
                  {call.outputPreview ? (
                    <pre>{call.outputPreview}</pre>
                  ) : (
                    <pre className="diagnose-tool-empty">no result recorded for this call</pre>
                  )}
                  {call.error && (
                    <>
                      <span>ERROR</span>
                      <pre className="diagnose-tool-empty">{call.error}</pre>
                    </>
                  )}
                </div>
              </details>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function DiagnoseProgressPanel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) =>
        Math.min(current + 1, DIAGNOSE_PROGRESS_LENSES.length - 1),
      );
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="candidate-review" aria-label="Diagnose progress">
      <header>
        <div>
          <span className="candidate-review__kicker">DISCOVER PROBLEMS</span>
          <h2>RUNNING</h2>
        </div>
        <strong data-status="rejected">ANALYZING</strong>
      </header>

      <div className="candidate-review__grid">
        <section>
          <span>STATUS</span>
          <h3>SCANNING TRACE</h3>
          <p>Normalizing the trace window, extracting deterministic signals, then running each diagnostic lens.</p>
        </section>
        <section>
          <span>AGENTS</span>
          <h3>{activeIndex + 1} / {DIAGNOSE_PROGRESS_LENSES.length}</h3>
          <p>Lens progress is shown while the request is pending. Final findings appear when all evaluators return.</p>
        </section>
      </div>

      <div className="diagnose-progress-list">
        {DIAGNOSE_PROGRESS_LENSES.map((lens, index) => {
          const state = index < activeIndex ? "complete" : index === activeIndex ? "active" : "queued";
          return (
            <article className="diagnose-progress-card" data-state={state} key={lens.id}>
              <span>{state}</span>
              <h3>{lens.name}</h3>
              <p>{lens.description}</p>
            </article>
          );
        })}
      </div>
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
  | { jobId: string; startTurn: number; endTurn: number; replaySource: "production" }
  | string {
  const jobId = form.jobId.trim();
  const startTurn = Number(form.startTurn);
  const endTurn = Number(form.endTurn);
  if (!/^\d+$/.test(jobId)) return "Enter a numeric job ID.";
  if (!Number.isInteger(startTurn) || startTurn < 1) return "Start turn must be a positive integer.";
  if (!Number.isInteger(endTurn) || endTurn < 1) return "End turn must be a positive integer.";
  if (startTurn > endTurn) return "Start turn cannot be greater than end turn.";
  return { jobId, startTurn, endTurn, replaySource: form.replaySource };
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
      Array.isArray((value as DiagnoseResponse).lenses) &&
      Array.isArray((value as DiagnoseResponse).patterns) &&
      Array.isArray((value as DiagnoseResponse).llmFindings) &&
      Array.isArray((value as DiagnoseResponse).evaluatorReports) &&
      Array.isArray((value as DiagnoseResponse).toolCalls) &&
      Array.isArray((value as DiagnoseResponse).toolSummary),
  );
}
