import type {
  BaselineSource,
  DiagnoseRunSummary,
  OriginalSourceOption,
  ReplayMode,
  ReplaySource,
} from "../types";

export interface BacktestFormState {
  jobId: string;
  callout: string;
  expectedBehavior: string;
  startTurn: string;
  endTurn: string;
  baselineSource: BaselineSource;
  replaySource: ReplaySource;
  diagnosisRunId: string;
  replayMode: ReplayMode;
  debug: boolean;
  evaluate: boolean;
  callNiko: boolean;
  useCompactContext: boolean;
}

interface ControlDeckProps {
  value: BacktestFormState;
  busy: boolean;
  validationError: string | null;
  baselineOptions: OriginalSourceOption[];
  baselineOptionsLoading: boolean;
  diagnosisRuns: DiagnoseRunSummary[];
  diagnosisRunsLoading: boolean;
  theoAvailable: boolean;
  evaluationAvailable: boolean;
  onChange: (next: BacktestFormState) => void;
  onSubmit: () => void;
  onTheo: () => void;
  onEvaluation: () => void;
  debugMode?: boolean;
}

export function ControlDeck({
  value,
  busy,
  validationError,
  baselineOptions,
  baselineOptionsLoading,
  diagnosisRuns,
  diagnosisRunsLoading,
  theoAvailable,
  evaluationAvailable,
  onChange,
  onSubmit,
  onTheo,
  onEvaluation,
  debugMode = true,
}: ControlDeckProps) {
  const update = <Key extends keyof BacktestFormState>(
    key: Key,
    nextValue: BacktestFormState[Key],
  ) => onChange({ ...value, [key]: nextValue });

  return (
    <form
      className="control-deck"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      noValidate
    >
      {/* <div className="control-deck__header">
        <div>
          <span className="eyebrow">[ TEST PARAMETERS ]</span>
          <h2>Replay control</h2>
        </div>
        <samp className="endpoint-readout">
          POST // LOCALHOST:3000/COPILOT/SIMULATE
        </samp>
      </div> */}

      {/* FIELD and BUTTONS */}
      <div className={debugMode ? "control-grid" : "control-grid control-grid--guided"}>
        {debugMode && (
          <>
            <label className="field field--job">
              <span>JOB ID</span>
              <input
                name="jobId"
                inputMode="numeric"
                autoComplete="off"
                placeholder={value.evaluate ? "AUTO" : "ENTER ID"}
                value={value.jobId}
                disabled={value.evaluate}
                onChange={(event) => update("jobId", event.target.value)}
                aria-describedby={validationError ? "form-error" : undefined}
              />
            </label>

            <label className="field">
              <span>START TURN</span>
              <input
                name="startTurn"
                type="number"
                min="1"
                step="1"
                placeholder="—"
                value={value.startTurn}
                onChange={(event) => update("startTurn", event.target.value)}
              />
            </label>

            <label className="field">
              <span>END TURN</span>
              <input
                name="endTurn"
                type="number"
                min="1"
                step="1"
                placeholder="—"
                value={value.endTurn}
                onChange={(event) => update("endTurn", event.target.value)}
              />
            </label>
          </>
        )}

        <label className="field field--baseline">
          <span>{value.evaluate || !debugMode ? "DIAGNOSIS RUN" : "ORIGINAL AGENT"}</span>
          {value.evaluate || !debugMode ? (
            <select
              name="diagnosisRunId"
              value={value.diagnosisRunId}
              disabled={diagnosisRunsLoading}
              onChange={(event) => update("diagnosisRunId", event.target.value)}
            >
              <option value="">SELECT DIAGNOSIS</option>
              {diagnosisRuns.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {run.jobId} / TURNS {run.startTurn}-{run.endTurn} / {run.findingCount} FOUND
                </option>
              ))}
            </select>
          ) : (
            <select
              name="baselineSource"
              value={value.baselineSource}
              disabled={baselineOptionsLoading}
              onChange={(event) =>
                update("baselineSource", event.target.value as BaselineSource)
              }
            >
              {baselineOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </label>

        <label className="field field--mode">
          <span>REPLAY SOURCE</span>
          <input name="replaySource" value="PRODUCTION DATA" disabled readOnly />
        </label>

        {debugMode && !value.evaluate && (
          <label className="field field--mode">
            <span>NEW AGENT MODE</span>
            <select
              name="replayMode"
              value={value.replayMode}
              onChange={(event) =>
                update("replayMode", event.target.value as ReplayMode)
              }
            >
              <option value="candidate">CANDIDATE</option>
              <option value="original">ORIGINAL</option>
            </select>
          </label>
        )}

        {debugMode && (
          <>
            <label className="switch-control">
              <input
                name="evaluate"
                type="checkbox"
                checked={value.evaluate}
                onChange={(event) => update("evaluate", event.target.checked)}
              />
              <span className="switch-control__track" aria-hidden="true">
                <span />
              </span>
              <span>
                EVALUATE
                <small>BEHAVIOUR TEST</small>
              </span>
            </label>

            <label className="switch-control">
              <input
                name="callNiko"
                type="checkbox"
                checked={value.callNiko}
                onChange={(event) => update("callNiko", event.target.checked)}
              />
              <span className="switch-control__track" aria-hidden="true">
                <span />
              </span>
              <span>
                NIKO
                <small>SIMULATE GUARD</small>
              </span>
            </label>

            <label className="switch-control">
              <input
                name="useCompactContext"
                type="checkbox"
                checked={value.useCompactContext ?? true}
                onChange={(event) =>
                  update("useCompactContext", event.target.checked)
                }
              />
              <span className="switch-control__track" aria-hidden="true">
                <span />
              </span>
              <span>
                COMPACT
                <small>THEO / REPLAY / MAYA</small>
              </span>
            </label>
          </>
        )}

        <div className="control-actions">
          <button
            className="execute-button"
            type="submit"
            disabled={
              busy ||
              (value.evaluate || !debugMode
                ? !value.diagnosisRunId
                : !value.callout.trim() || !value.expectedBehavior.trim())
            }
          >
            <span>{busy ? "RUNNING" : "EXECUTE BACKTEST"}</span>
            <span aria-hidden="true">{busy ? "///" : "↗"}</span>
          </button>
          <button
            className="theo-button"
            type="button"
            disabled={busy || !theoAvailable}
            onClick={onTheo}
            title={
              theoAvailable
                ? "Open Theo diagnosis"
                : "Run a backtest before opening Theo"
            }
          >
            THEO
          </button>
          <button
            className="evaluation-button"
            type="button"
            disabled={busy || !evaluationAvailable}
            onClick={onEvaluation}
            title={
              evaluationAvailable
                ? "Open evaluation history"
                : "Enter a job ID before opening evaluations"
            }
          >
            EVALUATION
          </button>
        </div>

        {debugMode && !value.evaluate && (
          <label className="field field--callout">
            <span>WHAT SHOULD MAYA JUDGE?</span>
            <textarea
              name="callout"
              rows={2}
              placeholder="DESCRIBE WHAT WENT WRONG AND WHAT SHOULD IMPROVE"
              value={value.callout}
              onChange={(event) => update("callout", event.target.value)}
            />
          </label>
        )}

        {debugMode && !value.evaluate && (
          <label className="field field--callout">
            <span>EXPECTED BEHAVIOUR</span>
            <textarea
              name="expectedBehavior"
              rows={2}
              placeholder="DESCRIBE HOW THE COPILOT SHOULD HAVE RESPONDED"
              value={value.expectedBehavior}
              onChange={(event) => update("expectedBehavior", event.target.value)}
              required
            />
          </label>
        )}
      </div>

      <div className="control-deck__footer">
        <span>
          {value.evaluate || !debugMode
            ? "EVALUATE BACKTESTS THE SELECTED DIAGNOSIS RUN"
            : "BASELINE LOADS RECORDED OUTPUT / NEW AGENT RUNS SELECTED MODE"}
        </span>
        <output id="form-error" className="form-error" aria-live="polite">
          {validationError ?? ""}
        </output>
      </div>
    </form>
  );
}
