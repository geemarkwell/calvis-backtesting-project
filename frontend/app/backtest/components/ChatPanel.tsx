import type { RefObject, UIEventHandler } from 'react';
import type { GuardReply, PanelState, SimulationTurn } from '../types';

interface ChatPanelProps {
  title: string;
  state: PanelState;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: UIEventHandler<HTMLDivElement>;
}

export function ChatPanel({
  title,
  state,
  scrollRef,
  onScroll,
}: ChatPanelProps) {
  return (
    <section className="chat-panel" aria-label={`${title} replay`}>
      <header className="chat-panel__header">
        <h2>{title}</h2>
      </header>

      <div
        className="chat-panel__scroll"
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={0}
      >
        {state.status === 'idle' && (
          <EmptyState title="No replay loaded" copy="Run a backtest to compare messages." />
        )}
        {state.status === 'loading' && <LoadingState />}
        {state.status === 'error' && (
          <EmptyState
            title="Replay unavailable"
            copy={state.error ?? 'Unknown simulation failure.'}
            alert
          />
        )}
        {state.status === 'success' && state.data?.turns.length === 0 && (
          <EmptyState
            title="No turns returned"
            copy="No replayable messages were returned."
          />
        )}
        {state.status === 'success' &&
          state.data?.turns.map((turn) => (
            <TurnBlock key={`${turn.turn}-${turn.timestamp}`} turn={turn} />
          ))}
      </div>
    </section>
  );
}

function TurnBlock({ turn }: { turn: SimulationTurn }) {
  const replies = repliesForTurn(turn);
  const hasMessages = replies.length > 0 || turn.copilotMessages.length > 0;

  return (
    <article className="turn-block">
      <small className="turn-label">Turn {turn.turn}</small>
      <div className="message-stack">
        {replies.map((reply, index) => (
          <GuardMessage
            key={`${turn.turn}-guard-${index}`}
            reply={reply}
          />
        ))}

        {turn.copilotMessages.map((message, index) => (
          <div
            className="message-row message-row--copilot"
            key={`${turn.turn}-copilot-${index}`}
          >
            <span className="speaker-label">Copilot</span>
            <div className="message message--copilot">
              <p>{message}</p>
            </div>
          </div>
        ))}

        {!hasMessages && (
          <p className="silence-marker">
            {turn.skipped ? 'Turn not run' : 'No messages'}
          </p>
        )}
      </div>
    </article>
  );
}

function GuardMessage({ reply }: { reply: GuardReply }) {
  return (
    <div className="message-row message-row--guard">
      <span className="speaker-label">
        Guard{reply.source === 'simulated' ? ' · simulated' : ''}
      </span>
      <div className="message message--guard">
        <p>{reply.reply ?? 'No reply'}</p>
      </div>
    </div>
  );
}

function EmptyState({
  title,
  copy,
  alert = false,
}: {
  title: string;
  copy: string;
  alert?: boolean;
}) {
  return (
    <div className={alert ? 'empty-state empty-state--alert' : 'empty-state'}>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state" role="status">
      <p>Running replay…</p>
    </div>
  );
}

function repliesForTurn(turn: SimulationTurn): GuardReply[] {
  if (turn.guardReplies.length > 0) {
    return turn.guardReplies;
  }
  return turn.guardMessages.map((message) => ({
    reply: message,
    source: 'historical',
    historicalReply: message,
  }));
}
