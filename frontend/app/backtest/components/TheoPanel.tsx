import { useEffect, useRef, useState, type FormEvent } from "react";
import { diagnoseWithTheo } from "../api";
import type { TheoContext, TheoResponse } from "../types";

interface TheoPanelProps {
  context: TheoContext;
  callout: string | null;
  onBack: () => void;
}

type TheoStatus = "idle" | "loading" | "success" | "error";

export function TheoPanel({ context, callout, onBack }: TheoPanelProps) {
  const [startTurn, setStartTurn] = useState(String(context.startTurn));
  const [endTurn, setEndTurn] = useState(String(context.endTurn));
  const [whatWentWrong, setWhatWentWrong] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [status, setStatus] = useState<TheoStatus>("idle");
  const [response, setResponse] = useState<TheoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  async function submitDiagnosis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedStartTurn = Number(startTurn);
    const selectedEndTurn = Number(endTurn);
    const problem = whatWentWrong.trim();
    const expectation = expectedBehavior.trim();

    if (
      !Number.isInteger(selectedStartTurn) ||
      !Number.isInteger(selectedEndTurn) ||
      selectedStartTurn < context.startTurn ||
      selectedEndTurn > context.endTurn ||
      selectedStartTurn > selectedEndTurn
    ) {
      setError(
        "Choose a valid turn range between " +
          context.startTurn +
          " and " +
          context.endTurn +
          ".",
      );
      setResponse(null);
      setStatus("error");
      return;
    }

    if (!problem || !expectation) {
      setError("Describe what went wrong and expected behaviour.");
      setResponse(null);
      setStatus("error");
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("loading");
    setError(null);
    setResponse(null);

    try {
      const result = await diagnoseWithTheo(
        {
          whatWentWrong: problem,
          expectedBehavior: expectation,
          badResponses: [
            {
              simTarget: context.simTarget,
              startTurn: selectedStartTurn,
              endTurn: selectedEndTurn,
            },
          ],
        },
        controller.signal,
      );

      if (!controller.signal.aborted) {
        setResponse(result);
        setStatus("success");
      }
    } catch (diagnosisError: unknown) {
      if (!controller.signal.aborted) {
        setError(
          diagnosisError instanceof Error
            ? diagnosisError.message
            : String(diagnosisError),
        );
        setStatus("error");
      }
    }
  }

  return (
    <section className="theo-workspace" aria-label="Theo diagnosis">
      <header className="theo-toolbar">
        <button type="button" onClick={onBack}>
          Back to trace
        </button>
        <p>
          Simulation {context.simTarget}
          <span aria-hidden="true"> · </span>
          Available turns {context.startTurn}–{context.endTurn}
        </p>
      </header>

      <div className="theo-layout">
        <form className="theo-form" onSubmit={submitDiagnosis} noValidate>
          <span className="theo-kicker">Theo input</span>
          <h2>Diagnose this run</h2>
          <p className="theo-intro">
            Tell Theo what failed and what should have happened instead.
          </p>

          <div className="theo-turn-range">
            <label>
              <span>Start turn</span>
              <input
                name="theoStartTurn"
                type="number"
                min={context.startTurn}
                max={context.endTurn}
                step="1"
                value={startTurn}
                onChange={(event) => setStartTurn(event.target.value)}
                disabled={status === "loading"}
                required
              />
            </label>
            <label>
              <span>End turn</span>
              <input
                name="theoEndTurn"
                type="number"
                min={context.startTurn}
                max={context.endTurn}
                step="1"
                value={endTurn}
                onChange={(event) => setEndTurn(event.target.value)}
                disabled={status === "loading"}
                required
              />
            </label>
          </div>

          <div className="theo-problem-field">
            <div className="theo-field-heading">
              <label htmlFor="what-went-wrong">What went wrong</label>
              <button
                className="theo-callout-button"
                type="button"
                onClick={() => callout && setWhatWentWrong(callout)}
                disabled={status === "loading" || !callout}
                title={
                  callout
                    ? "Fill with saved callout"
                    : "No saved callout is available for this job"
                }
              >
                Use callout
              </button>
            </div>
            <textarea
              id="what-went-wrong"
              name="whatWentWrong"
              rows={7}
              value={whatWentWrong}
              onChange={(event) => setWhatWentWrong(event.target.value)}
              placeholder="The Copilot kept asking for confirmation after the guard had already answered."
              disabled={status === "loading"}
              required
            />
          </div>

          <label>
            <span>Expected behaviour</span>
            <textarea
              name="expectedBehavior"
              rows={7}
              value={expectedBehavior}
              onChange={(event) => setExpectedBehavior(event.target.value)}
              placeholder="Acknowledge the answer and stop asking once enough evidence is available."
              disabled={status === "loading"}
              required
            />
          </label>

          <button
            className="theo-submit"
            type="submit"
            disabled={status === "loading"}
          >
            {status === "loading" ? "Diagnosing…" : "Run Theo"}
          </button>

          {status === "error" && (
            <p className="theo-error" role="alert">
              {error}
            </p>
          )}
        </form>

        <div className="theo-output" aria-live="polite">
          {status === "idle" && (
            <div className="theo-output__empty">
              <span className="theo-kicker">Theo output</span>
              <h2>Diagnosis will appear here.</h2>
            </div>
          )}
          {status === "loading" && (
            <div className="theo-output__empty" role="status">
              <span className="theo-kicker">Theo is working</span>
              <h2>Reading trace and prompt system…</h2>
            </div>
          )}
          {status === "error" && !response && (
            <div className="theo-output__empty">
              <span className="theo-kicker">No diagnosis</span>
              <h2>Update input and try again.</h2>
            </div>
          )}
          {status === "success" && response && (
            <TheoResult response={response} />
          )}
        </div>
      </div>
    </section>
  );
}

function TheoResult({ response }: { response: TheoResponse }) {
  const { diagnosis } = response;
  const promptChange = response.suggestedPromptChange;

  return (
    <article className="theo-result">
      <header>
        <span className="theo-kicker">Diagnosis</span>
        <h2>{diagnosis.failure_mode}</h2>
        <p className="theo-confidence">
          {Math.round(diagnosis.confidence * 100)}% confidence
        </p>
      </header>

      <section>
        <h3>Hypothesis</h3>
        <p>{diagnosis.hypothesis}</p>
      </section>

      <section>
        <h3>Observed behaviour</h3>
        {diagnosis.observed_behavior.map((observation, index) => (
          <div
            className="theo-observation"
            key={`${observation.claim}-${index}`}
          >
            <p>{observation.claim}</p>
            <small>{observation.trace_refs.join(" · ")}</small>
          </div>
        ))}
      </section>

      <section>
        <h3>Prompt diagnosis</h3>
        <p>{diagnosis.prompt_diagnosis.explanation}</p>
        <small>
          {diagnosis.prompt_diagnosis.file} ·{" "}
          {diagnosis.prompt_diagnosis.section} ·{" "}
          {diagnosis.prompt_diagnosis.diagnosis_type.replaceAll("_", " ")}
        </small>
        <p className="theo-prompt-copy">
          {diagnosis.prompt_diagnosis.exact_text}
        </p>
      </section>

      <section>
        <h3>Suggested prompt change</h3>
        <small>{promptChange.file}</small>
        <div className="theo-change">
          <div>
            <span>Current</span>
            <p>{promptChange.old_text}</p>
          </div>
          <div>
            <span>Suggested</span>
            <p>{promptChange.new_text}</p>
          </div>
        </div>
        <p>{promptChange.intended_effect}</p>
      </section>

      {diagnosis.risks.length > 0 && (
        <section>
          <h3>Risks</h3>
          <ul>
            {diagnosis.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </section>
      )}

      {diagnosis.uncertainties.length > 0 && (
        <section>
          <h3>Uncertainties</h3>
          <ul>
            {diagnosis.uncertainties.map((uncertainty) => (
              <li key={uncertainty}>{uncertainty}</li>
            ))}
          </ul>
        </section>
      )}

      <footer>
        <span>
          Job {response.candidatePromptJobId} · Prompt{" "}
          {response.candidatePromptVersion}
        </span>
        <span>{response.runId}</span>
        <span>{response.artifactDirectory}</span>
      </footer>
    </article>
  );
}
