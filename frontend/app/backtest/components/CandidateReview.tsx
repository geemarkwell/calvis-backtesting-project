import { useState } from "react";
import { decideCandidate } from "../api";
import type { BacktestResponse, CandidateDecision } from "../types";

interface CandidateReviewProps {
  result: BacktestResponse;
  onDecision: (decision: CandidateDecision) => void;
}

export function CandidateReview({ result, onDecision }: CandidateReviewProps) {
  const [submitting, setSubmitting] = useState<"accept" | "reject" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const { updatedPrompt, candidateDecision, maya, theo } = result;
  const canDecide = candidateDecision.status === "pending" && maya !== null;

  async function submitDecision(action: "accept" | "reject") {
    setSubmitting(action);
    setError(null);
    try {
      const response = await decideCandidate(action, {
        jobId: candidateDecision.jobId,
        version: candidateDecision.version,
      });
      onDecision(response.decision);
    } catch (decisionError: unknown) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : String(decisionError),
      );
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <section className="candidate-review" aria-label="Candidate prompt review">
      <header>
        <div>
          <span className="candidate-review__kicker">PROMPT CANDIDATE</span>
          <h2>
            JOB {updatedPrompt.jobId} / VERSION {updatedPrompt.version}
          </h2>
        </div>
        <strong data-status={candidateDecision.status}>
          {candidateDecision.status.toUpperCase()}
        </strong>
      </header>

      <div className="candidate-review__grid">
        <section>
          <span>THEO DIAGNOSIS</span>
          <h3>{theo.diagnosis.failure_mode}</h3>
          <p>{theo.diagnosis.hypothesis}</p>
        </section>
        <section>
          <span>MAYA VERDICT</span>
          <h3>{maya ? maya.verdict.verdict.toUpperCase() : "UNAVAILABLE"}</h3>
          <p>{maya?.verdict.summary ?? result.mayaError}</p>
        </section>
      </div>

      <div className="candidate-review__change">
        <small>{updatedPrompt.file}</small>
        <div>
          <section>
            <span>ORIGINAL</span>
            <p>{updatedPrompt.oldText}</p>
          </section>
          <section>
            <span>CANDIDATE</span>
            <p>{updatedPrompt.newText}</p>
          </section>
        </div>
      </div>

      <footer>
        <p>{updatedPrompt.intendedEffect}</p>
        <div>
          <button
            type="button"
            className="candidate-review__reject"
            disabled={!canDecide || submitting !== null}
            onClick={() => void submitDecision("reject")}
          >
            {submitting === "reject" ? "REJECTING…" : "REJECT"}
          </button>
          <button
            type="button"
            className="candidate-review__accept"
            disabled={!canDecide || submitting !== null}
            onClick={() => void submitDecision("accept")}
          >
            {submitting === "accept"
              ? "APPLYING…"
              : "ACCEPT & APPLY TO REAL PROMPT"}
          </button>
        </div>
      </footer>

      {error && (
        <p className="candidate-review__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
