"use client";

import { useRef, useState } from "react";
import {
  draftTestCriteria,
  type DraftTestCriteriaResponse,
  type DraftTestSpec,
} from "./eval-suite/api";

const openingMessages = [
  {
    role: "User",
    text: "Ask a plain-language evaluation question and CIE will draft a TestSpec with criteria.",
  },
  {
    role: "CIE",
    text: "I’ll return the TestSpec id, name, criteria ids, importance, pass rules, and evidence needed from the test-criteria API.",
  },
];

export default function CieMockScreen() {
  const [activePanel, setActivePanel] = useState<"eval" | null>("eval");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState(openingMessages);
  const [drafts, setDrafts] = useState<DraftTestCriteriaResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);

  async function submitQuestion() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || loading) {
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setLoading(true);
    setError(null);
    setMessages((current) => [
      ...current,
      { role: "User", text: trimmedQuestion },
      { role: "CIE", text: "Drafting TestSpec criteria…" },
    ]);
    setActivePanel("eval");
    setQuestion("");

    try {
      const result = await draftTestCriteria(trimmedQuestion, controller.signal);
      if (controller.signal.aborted) {
        return;
      }

      setDrafts((current) => [result, ...current]);
      setMessages((current) => [
        ...replaceLastDraftingMessage(current),
        {
          role: "CIE",
          text: `Drafted TestSpec ${result.testSpec.id} with ${result.testSpec.criteria.length} criteria.`,
        },
      ]);
    } catch (requestError: unknown) {
      if (!controller.signal.aborted) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : String(requestError);
        setError(message);
        setMessages((current) => [
          ...replaceLastDraftingMessage(current),
          { role: "CIE", text: message },
        ]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  return (
    <main className="cie-mock-shell">
      <section className="cie-chat-stage" aria-label="CIE chat workspace">
        <header className="cie-chat-header">
          <div>
            <span className="cie-kicker">Copilot Improvement Engine</span>
            <h1>Evaluation Console</h1>
          </div>
          <span className="cie-status">TEST CRITERIA</span>
        </header>

        <div className="cie-chat-card">
          <div className="cie-chat-scroll">
            {messages.map((message, index) => (
              <article
                className={`cie-message cie-message--${
                  message.role === "User" ? "user" : "agent"
                }`}
                key={`${message.role}-${index}`}
              >
                <span>{message.role}</span>
                <p>{message.text}</p>
              </article>
            ))}
          </div>

          <form
            className="cie-chat-input"
            onSubmit={(event) => {
              event.preventDefault();
              void submitQuestion();
            }}
          >
            <label htmlFor="criteria-question">Question</label>
            <textarea
              id="criteria-question"
              rows={3}
              placeholder="Example: Is the Copilot updating guard profiles properly after each shift?"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={loading}
            />
            <button type="submit" disabled={!question.trim() || loading}>
              {loading ? "Drafting…" : "Draft TestSpec"}
            </button>
          </form>
        </div>
      </section>

      <nav className="cie-right-nav" aria-label="Workspace navigation">
        <button
          type="button"
          className={activePanel === "eval" ? "is-active" : undefined}
          onClick={() =>
            setActivePanel((current) => (current === "eval" ? null : "eval"))
          }
        >
          <span>Eval</span>
        </button>
      </nav>

      {activePanel === "eval" && (
        <aside className="cie-eval-panel" aria-label="Test specification list">
          <div className="cie-panel-header">
            <span className="cie-kicker">Eval suite</span>
            <button type="button" onClick={() => setActivePanel(null)}>
              Close
            </button>
          </div>

          <h2>TestSpecs</h2>
          <p className="cie-spec-id">
            {loading
              ? "drafting..."
              : `${drafts.length} response${drafts.length === 1 ? "" : "s"}`}
          </p>

          {error && <p className="cie-panel-error">{error}</p>}

          {!loading && drafts.length === 0 && !error && (
            <div className="cie-panel-empty">
              Submit a question to generate a TestSpec from the test-criteria API.
            </div>
          )}

          <div className="cie-testspec-list">
            {drafts.map((draft) => (
              <TestSpecCard response={draft} key={draft.runId} />
            ))}
          </div>
        </aside>
      )}
    </main>
  );
}

function TestSpecCard({ response }: { response: DraftTestCriteriaResponse }) {
  const { testSpec } = response;
  return (
    <article className="cie-testspec-card">
      <span>{testSpec.id}</span>
      <h3>{testSpec.name}</h3>
      <p>{testSpec.description ?? testSpec.userQuestion}</p>
      <small className="cie-run-id">Run {response.runId}</small>

      <div className="cie-criteria-list">
        {testSpec.criteria.map((criterion) => (
          <section className="cie-criterion-card" key={criterion.id}>
            <div className="cie-criterion-card__header">
              <strong>{criterion.id}</strong>
              <em>{criterion.importance}</em>
            </div>
            <p>{criterion.description}</p>
            <dl>
              <div>
                <dt>Pass rule</dt>
                <dd>{criterion.passRule}</dd>
              </div>
              <div>
                <dt>Evidence needed</dt>
                <dd>{evidenceNeeded(testSpec, criterion.id)}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>
    </article>
  );
}

function evidenceNeeded(testSpec: DraftTestSpec, criterionId: string): string {
  const criterion = testSpec.criteria.find((item) => item.id === criterionId);
  const evidence = criterion?.evidenceNeeded?.length
    ? criterion.evidenceNeeded
    : testSpec.requiredEvidence;
  return evidence.join(", ");
}

function replaceLastDraftingMessage(
  messages: typeof openingMessages,
): typeof openingMessages {
  const next = [...messages];
  const last = next.at(-1);
  if (last?.role === "CIE" && last.text === "Drafting TestSpec criteria…") {
    next.pop();
  }
  return next;
}
