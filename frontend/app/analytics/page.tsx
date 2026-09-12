"use client";

import { useEffect, useMemo, useState } from "react";

type Range = "day" | "week";
type AnalyticsView = "vulnerabilities" | "evaluations";

interface LensPerformanceRow {
  lensId: string;
  lensName: string;
  diagnosisFindingCount: number;
  mayaEvalCount: number;
  mayaPassCount: number;
  mayaFailCount: number;
  mayaPassRate: number | null;
}

interface MayaOutcomeBucket {
  bucket: string;
  passCount: number;
  failCount: number;
  totalCount: number;
}

interface LensPerformanceResponse {
  range: Range;
  generatedAt: string;
  summary: {
    diagnosisFindingCount: number;
    mayaEvalCount: number;
    mayaPassCount: number;
    mayaFailCount: number;
    mayaPassRate: number | null;
  };
  mostDiagnosisFailures: LensPerformanceRow[];
  mostMayaPasses: LensPerformanceRow[];
  mostMayaFails: LensPerformanceRow[];
  mayaOutcomeTrend: MayaOutcomeBucket[];
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 260;
const CHART_LEFT = 52;
const CHART_RIGHT = 24;
const CHART_TOP = 24;
const CHART_BOTTOM = 42;

const POLICIES = [
  { id: "policy-role-authority", label: "Policy 1", name: "Role and Authority" },
  { id: "policy-uniform-attire", label: "Policy 2", name: "Uniform and Attire" },
  { id: "policy-time-scheduling", label: "Policy 3", name: "Time and Scheduling" },
  { id: "policy-checkin-checkout", label: "Policy 4", name: "Check-In and Check-Out" },
  { id: "policy-patrol-expectations", label: "Policy 5", name: "Patrol Expectations" },
  { id: "policy-report-cadence", label: "Policy 6", name: "Report Cadence" },
  { id: "policy-escalation-rules", label: "Policy 7", name: "Escalation Rules" },
];

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>("day");
  const [view, setView] = useState<AnalyticsView>("vulnerabilities");
  const [data, setData] = useState<LensPerformanceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/lens-performance?range=${range}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message ?? "Analytics failed");
        setData(payload);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range]);

  return (
    <main className="backtest-shell">
      <section className="candidate-review analytics-dashboard">
        <header>
          <div>
            <span className="candidate-review__kicker">CIE ANALYTICS</span>
            <h2>Policy Analytics</h2>
          </div>
          <strong data-status={error ? "rejected" : "accepted"}>
            {loading ? "LOADING" : error ? "ERROR" : "LIVE"}
          </strong>
        </header>

        <div className="analytics-toolbar">
          <div className="analytics-range-toggle" role="tablist" aria-label="Analytics range">
            {(["day", "week"] as Range[]).map((value) => (
              <button
                type="button"
                data-active={range === value}
                onClick={() => setRange(value)}
                key={value}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="analytics-range-toggle" role="tablist" aria-label="Analytics view">
            {(["vulnerabilities", "evaluations"] as AnalyticsView[]).map((value) => (
              <button
                type="button"
                data-active={view === value}
                onClick={() => setView(value)}
                key={value}
              >
                {value === "vulnerabilities" ? "VULNERABILITIES" : "EVALUATIONS"}
              </button>
            ))}
          </div>
        </div>

        {error && <StatusCard title="Analytics unavailable" body={error} rejected />}
        {!error && loading && <StatusCard title="Loading analytics" body="Reading CIE DB lens records." />}
        {!error && !loading && data && <AnalyticsContent data={data} view={view} />}
      </section>
    </main>
  );
}

function AnalyticsContent({ data, view }: { data: LensPerformanceResponse; view: AnalyticsView }) {
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const policyRows = policyPerformanceRows(data);
  const selectedPolicyRows = selectedPolicyId
    ? policyRows.filter((row) => row.lensId === selectedPolicyId)
    : null;
  const diagnosisRows = selectedPolicyRows ?? data.mostDiagnosisFailures;
  const mayaPassRows = selectedPolicyRows ?? data.mostMayaPasses;
  const mayaFailRows = selectedPolicyRows ?? data.mostMayaFails;
  return (
    <>
      {view === "vulnerabilities" ? (
        <div className="candidate-review__grid analytics-summary-grid">
          {policyRows.map((row) => (
            <MetricCard
              label={policyDisplayName(row.lensId, row.lensName)}
              value={row.diagnosisFindingCount}
              detail={undefined}
              selected={selectedPolicyId === row.lensId}
              onClick={() => setSelectedPolicyId((current) => current === row.lensId ? null : row.lensId)}
              key={row.lensId}
            />
          ))}
        </div>
      ) : (
        <div className="candidate-review__grid analytics-summary-grid">
          <MetricCard label="Diagnose findings" value={data.summary.diagnosisFindingCount} />
          <MetricCard label="Maya evals" value={data.summary.mayaEvalCount} />
          <MetricCard label="Maya passed" value={data.summary.mayaPassCount} status="accepted" />
          <MetricCard label="Maya failed" value={data.summary.mayaFailCount} status="rejected" />
          <MetricCard label="Pass rate" value={formatRate(data.summary.mayaPassRate)} />
        </div>
      )}

      <section className="candidate-review__change analytics-panel">
        <small>MAYA PASSED / FAILED BY {data.range.toUpperCase()}</small>
        <MayaOutcomeChart buckets={data.mayaOutcomeTrend} />
      </section>

      <div className="analytics-lens-columns">
        <LensRanking title="Most Diagnose Failures" rows={diagnosisRows} metric="diagnosisFindingCount" hideLensLabel={Boolean(selectedPolicyRows)} />
        <LensRanking title="Most Maya Passes" rows={mayaPassRows} metric="mayaPassCount" hideLensLabel={Boolean(selectedPolicyRows)} />
        <LensRanking title="Most Maya Fails" rows={mayaFailRows} metric="mayaFailCount" hideLensLabel={Boolean(selectedPolicyRows)} />
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  status,
  detail,
  selected = false,
  onClick,
}: {
  label: string;
  value: number | string;
  status?: "accepted" | "rejected";
  detail?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span>{label}</span>
      <h3 data-status={status}>{value}</h3>
      {detail && <small>{detail}</small>}
    </>
  );
  return (
    <section className={onClick ? "analytics-metric-card is-clickable" : "analytics-metric-card"} data-selected={selected}>
      {onClick ? <button type="button" onClick={onClick}>{content}</button> : content}
    </section>
  );
}

function policyPerformanceRows(data: LensPerformanceResponse): LensPerformanceRow[] {
  const byId = new Map(data.mostDiagnosisFailures.map((row) => [row.lensId, row]));
  for (const row of data.mostMayaPasses) byId.set(row.lensId, row);
  for (const row of data.mostMayaFails) byId.set(row.lensId, row);
  return POLICIES.map((policy) => byId.get(policy.id) ?? {
    lensId: policy.id,
    lensName: `${policy.label}: ${policy.name}`,
    diagnosisFindingCount: 0,
    mayaEvalCount: 0,
    mayaPassCount: 0,
    mayaFailCount: 0,
    mayaPassRate: null,
  });
}

function policyDisplayName(lensId: string, fallback: string): string {
  const policy = POLICIES.find((item) => item.id === lensId);
  return policy ? `${policy.label}: ${policy.name}` : fallback;
}

function LensRanking({
  title,
  rows,
  metric,
  hideLensLabel = false,
}: {
  title: string;
  rows: LensPerformanceRow[];
  metric: keyof Pick<LensPerformanceRow, "diagnosisFindingCount" | "mayaPassCount" | "mayaFailCount">;
  hideLensLabel?: boolean;
}) {
  return (
    <section className="candidate-review__change analytics-panel analytics-ranking">
      <small>{title}</small>
      {rows.length === 0 ? (
        <p>No lens records yet.</p>
      ) : (
        rows.map((row) => (
          <article className="analytics-ranking-row" key={`${title}-${row.lensId}`}>
            {!hideLensLabel && (
              <div>
                <strong>{policyDisplayName(row.lensId, row.lensName)}</strong>
                <span>{row.lensId}</span>
              </div>
            )}
            <b>{row[metric]}</b>
            {/* <small>
              {row.mayaEvalCount} Maya evals · {formatRate(row.mayaPassRate)} pass
            </small> */}
          </article>
        ))
      )}
    </section>
  );
}

function MayaOutcomeChart({ buckets }: { buckets: MayaOutcomeBucket[] }) {
  const points = useMemo(() => outcomePoints(buckets), [buckets]);
  const maxTotal = Math.max(1, ...buckets.map((bucket) => bucket.totalCount));
  if (buckets.length === 0) {
    return (
      <div className="confidence-chart confidence-chart--empty">
        <p>No Maya outcomes have been recorded yet.</p>
      </div>
    );
  }
  return (
    <div className="confidence-chart analytics-outcome-chart">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img">
        <title>Maya pass/fail trend</title>
        {[maxTotal, Math.ceil(maxTotal / 2), 0].map((value) => {
          const y = countY(value, maxTotal);
          return (
            <g key={value}>
              <line className="confidence-chart__grid" x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={y} y2={y} />
              <text className="confidence-chart__axis-label" x={CHART_LEFT - 10} y={y + 4} textAnchor="end">
                {value}
              </text>
            </g>
          );
        })}
        <path className="confidence-chart__line" d={linePath(points.map((point) => ({ x: point.x, y: point.passY })))} />
        <path className="confidence-chart__line confidence-chart__line--failed" d={linePath(points.map((point) => ({ x: point.x, y: point.failY })))} />
        <text className="confidence-chart__axis-label" x={CHART_LEFT} y={CHART_HEIGHT - 8}>Oldest</text>
        <text className="confidence-chart__axis-label" x={CHART_WIDTH - CHART_RIGHT} y={CHART_HEIGHT - 8} textAnchor="end">Newest</text>
      </svg>
      {points.map((point) => (
        <div className="confidence-chart__point analytics-outcome-point" key={point.bucket} style={{ left: `${(point.x / CHART_WIDTH) * 100}%`, top: `${(point.passY / CHART_HEIGHT) * 100}%` }}>
          <span>{point.passCount} pass / {point.failCount} fail · {point.bucket}</span>
        </div>
      ))}
    </div>
  );
}

function outcomePoints(buckets: MayaOutcomeBucket[]) {
  const maxTotal = Math.max(1, ...buckets.map((bucket) => bucket.totalCount));
  const span = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  return buckets.map((bucket, index) => {
    const x = buckets.length === 1
      ? CHART_LEFT + span / 2
      : CHART_LEFT + (index / (buckets.length - 1)) * span;
    return {
      bucket: bucket.bucket,
      passCount: bucket.passCount,
      failCount: bucket.failCount,
      x,
      passY: countY(bucket.passCount, maxTotal),
      failY: countY(bucket.failCount, maxTotal),
    };
  });
}

function countY(value: number, max: number) {
  const height = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  return CHART_TOP + height - (value / max) * height;
}

function linePath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function StatusCard({ title, body, rejected = false }: { title: string; body: string; rejected?: boolean }) {
  return (
    <div className="candidate-review__change">
      <section>
        <span>{title}</span>
        <p data-status={rejected ? "rejected" : undefined}>{body}</p>
      </section>
    </div>
  );
}

function formatRate(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
