import { useEffect, useMemo, useState } from 'react';
import { getMayaJudgments } from '../api';
import type {
  MayaJudgment,
  MayaJudgmentHistory,
  MayaMeasurement,
} from '../types';

interface EvaluationPanelProps {
  jobId: string;
  onBack: () => void;
}

type EvaluationStatus = 'loading' | 'success' | 'error';

export function EvaluationPanel({
  jobId,
  onBack,
}: EvaluationPanelProps) {
  const [status, setStatus] = useState<EvaluationStatus>('loading');
  const [history, setHistory] = useState<MayaJudgmentHistory | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void getMayaJudgments(jobId, controller.signal)
      .then((result) => {
        const judgments = [...result.judgments].sort((left, right) =>
          left.judgedAt.localeCompare(right.judgedAt),
        );
        setHistory({ ...result, judgments });
        setSelectedRunId(judgments.at(-1)?.runId ?? null);
        setStatus('success');
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : String(requestError),
          );
          setStatus('error');
        }
      });

    return () => controller.abort();
  }, [jobId]);

  const selectedJudgment =
    history?.judgments.find(
      (judgment) => judgment.runId === selectedRunId,
    ) ?? null;

  return (
    <section className="evaluation-workspace" aria-label="Evaluation progress">
      <header className="evaluation-toolbar">
        <button type="button" onClick={onBack}>
          Back to trace
        </button>
        <p>Job {jobId}</p>
      </header>

      {status === 'loading' && (
        <EvaluationState
          kicker="Evaluation"
          title="Loading judgment history…"
          status
        />
      )}

      {status === 'error' && (
        <EvaluationState
          kicker="Evaluation unavailable"
          title={error ?? 'Judgment history could not be loaded.'}
          alert
        />
      )}

      {status === 'success' && history?.judgments.length === 0 && (
        <EvaluationState
          kicker="No evaluations"
          title="No Maya judgments exist for this job yet."
        />
      )}

      {status === 'success' &&
        history &&
        history.judgments.length > 0 &&
        selectedJudgment && (
          <div className="evaluation-content">
            <section className="evaluation-trend">
              <span className="evaluation-kicker">Confidence trend</span>
              <h2>Agent progress</h2>
              <ConfidenceChart
                judgments={history.judgments}
                selectedRunId={selectedJudgment.runId}
                onSelect={setSelectedRunId}
              />
              <JudgmentSelector
                judgments={history.judgments}
                selectedRunId={selectedJudgment.runId}
                onSelect={setSelectedRunId}
              />
            </section>

            <JudgmentDetail judgment={selectedJudgment} />
          </div>
        )}
    </section>
  );
}

function EvaluationState({
  kicker,
  title,
  status = false,
  alert = false,
}: {
  kicker: string;
  title: string;
  status?: boolean;
  alert?: boolean;
}) {
  return (
    <div
      className="evaluation-state"
      role={alert ? 'alert' : status ? 'status' : undefined}
    >
      <span className="evaluation-kicker">{kicker}</span>
      <h2>{title}</h2>
    </div>
  );
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 260;
const CHART_LEFT = 54;
const CHART_RIGHT = 18;
const CHART_TOP = 24;
const CHART_BOTTOM = 40;

interface ConfidencePoint {
  judgment: MayaJudgment;
  confidence: number;
  x: number;
  y: number;
}

function ConfidenceChart({
  judgments,
  selectedRunId,
  onSelect,
}: {
  judgments: MayaJudgment[];
  selectedRunId: string;
  onSelect: (runId: string) => void;
}) {
  const points = useMemo(() => chartPoints(judgments), [judgments]);
  const segments = useMemo(() => chartSegments(judgments), [judgments]);
  const unavailableCount = judgments.length - points.length;

  if (points.length === 0) {
    return (
      <div className="confidence-chart confidence-chart--empty">
        <p>Confidence is unavailable for these saved evaluations.</p>
      </div>
    );
  }

  return (
    <>
      <div className="confidence-chart">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-labelledby="confidence-chart-title confidence-chart-description"
        >
          <title id="confidence-chart-title">Evaluation confidence trend</title>
          <desc id="confidence-chart-description">
            Confidence scores from oldest to newest Maya judgment for job.
          </desc>

          {[100, 50, 0].map((value) => {
            const y = confidenceY(value);
            return (
              <g key={value}>
                <line
                  className="confidence-chart__grid"
                  x1={CHART_LEFT}
                  x2={CHART_WIDTH - CHART_RIGHT}
                  y1={y}
                  y2={y}
                />
                <text
                  className="confidence-chart__axis-label"
                  x={CHART_LEFT - 10}
                  y={y + 4}
                  textAnchor="end"
                >
                  {value}%
                </text>
              </g>
            );
          })}

          {segments.map((segment, index) => (
            <path
              className="confidence-chart__line"
              d={segmentPath(segment)}
              key={index}
            />
          ))}

          <text
            className="confidence-chart__axis-label"
            x={CHART_LEFT}
            y={CHART_HEIGHT - 8}
          >
            Oldest
          </text>
          <text
            className="confidence-chart__axis-label"
            x={CHART_WIDTH - CHART_RIGHT}
            y={CHART_HEIGHT - 8}
            textAnchor="end"
          >
            Newest
          </text>
        </svg>

        {points.map((point) => (
          <button
            className="confidence-chart__point"
            data-selected={point.judgment.runId === selectedRunId}
            type="button"
            key={point.judgment.runId}
            style={{
              left: `${(point.x / CHART_WIDTH) * 100}%`,
              top: `${(point.y / CHART_HEIGHT) * 100}%`,
            }}
            onClick={() => onSelect(point.judgment.runId)}
            aria-label={`Select evaluation from ${formatDate(
              point.judgment.judgedAt,
            )}, ${point.confidence}% confidence`}
          >
            <span>{point.confidence}%</span>
          </button>
        ))}
      </div>

      {unavailableCount > 0 && (
        <p className="confidence-note">
          {unavailableCount} older evaluation
          {unavailableCount === 1 ? '' : 's'} omitted because confidence was not
          recorded.
        </p>
      )}
    </>
  );
}

function JudgmentSelector({
  judgments,
  selectedRunId,
  onSelect,
}: {
  judgments: MayaJudgment[];
  selectedRunId: string;
  onSelect: (runId: string) => void;
}) {
  return (
    <div className="judgment-selector" aria-label="Evaluation history">
      {judgments.map((judgment, index) => (
        <button
          type="button"
          key={judgment.runId}
          data-selected={judgment.runId === selectedRunId}
          onClick={() => onSelect(judgment.runId)}
        >
          <span>Run {index + 1}</span>
          <strong>
            {judgment.verdict.confidence === null
              ? '—'
              : `${judgment.verdict.confidence}%`}
          </strong>
          <small>{judgment.verdict.fixed ? 'Fixed' : 'Not fixed'}</small>
        </button>
      ))}
    </div>
  );
}

function JudgmentDetail({ judgment }: { judgment: MayaJudgment }) {
  const { verdict } = judgment;

  return (
    <article className="judgment-detail">
      <header>
        <div>
          <span className="evaluation-kicker">Selected evaluation</span>
          <h2>{formatDate(judgment.judgedAt)}</h2>
        </div>
        <span
          className={
            verdict.fixed
              ? 'judgment-status judgment-status--fixed'
              : 'judgment-status judgment-status--not-fixed'
          }
        >
          {verdict.fixed ? 'Fixed' : 'Not fixed'}
        </span>
      </header>

      <dl className="judgment-facts">
        <div>
          <dt>Fixed</dt>
          <dd>{verdict.fixed ? 'True' : 'False'}</dd>
        </div>
        <div>
          <dt>Verdict</dt>
          <dd>{verdict.verdict}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>
            {verdict.confidence === null
              ? 'Unavailable'
              : `${verdict.confidence}%`}
          </dd>
        </div>
      </dl>

      <section>
        <h3>Summary</h3>
        <p>{verdict.summary}</p>
      </section>

      <section>
        <h3>Criteria</h3>
        <div className="judgment-criteria">
          {verdict.criteria.map((criterion, index) => (
            <div key={`${criterion.claim}-${index}`}>
              <span
                className={
                  criterion.passed
                    ? 'criterion-state criterion-state--passed'
                    : 'criterion-state criterion-state--failed'
                }
              >
                {criterion.passed ? 'Passed' : 'Failed'}
              </span>
              <p>{criterion.claim}</p>
              <small>
                Old {formatMeasurement(criterion.old_measurement)}
                <span aria-hidden="true"> · </span>
                Candidate {formatMeasurement(criterion.candidate_measurement)}
              </small>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Limitations</h3>
        {verdict.limitations.length > 0 ? (
          <ul>
            {verdict.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        ) : (
          <p>No limitations reported.</p>
        )}
      </section>

      <section>
        <h3>Callout</h3>
        <p>{judgment.callout}</p>
      </section>

      <footer>
        <span>{judgment.runId}</span>
        <span>
          Old simulation {formatSimulation(judgment.oldReplay.simulationNumber)}
          <span aria-hidden="true"> · </span>
          Candidate simulation{' '}
          {formatSimulation(judgment.candidateReplay.simulationNumber)}
        </span>
      </footer>
    </article>
  );
}

function chartPoints(judgments: MayaJudgment[]): ConfidencePoint[] {
  return judgments.flatMap((judgment, index) => {
    const confidence = judgment.verdict.confidence;
    if (confidence === null) {
      return [];
    }
    return [
      {
        judgment,
        confidence,
        x: judgmentX(index, judgments.length),
        y: confidenceY(confidence),
      },
    ];
  });
}

function chartSegments(judgments: MayaJudgment[]): ConfidencePoint[][] {
  const segments: ConfidencePoint[][] = [];
  let current: ConfidencePoint[] = [];

  judgments.forEach((judgment, index) => {
    const confidence = judgment.verdict.confidence;
    if (confidence === null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      return;
    }
    current.push({
      judgment,
      confidence,
      x: judgmentX(index, judgments.length),
      y: confidenceY(confidence),
    });
  });

  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}

function judgmentX(index: number, count: number): number {
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  if (count <= 1) {
    return CHART_LEFT + plotWidth / 2;
  }
  return CHART_LEFT + (index / (count - 1)) * plotWidth;
}

function confidenceY(confidence: number): number {
  const plotHeight = CHART_HEIGHT - CHART_TOP - CHART_BOTTOM;
  return CHART_TOP + ((100 - confidence) / 100) * plotHeight;
}

function segmentPath(points: ConfidencePoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatMeasurement(value: MayaMeasurement): string {
  if (value === null) {
    return 'none';
  }
  return String(value);
}

function formatSimulation(value: number | null): string {
  return value === null ? 'unavailable' : String(value);
}
