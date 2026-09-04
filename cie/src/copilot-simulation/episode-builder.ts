import { BadRequestException } from '@nestjs/common';
import type { RecordedReplayToolCall } from '../mastra/copilot/types';
import { normalizeTrace } from '../mastra/theo/trace-normalizer';
import type {
  BaselineEntry,
  ShiftBundle,
  SimulationEpisode,
} from './copilot-simulation.types';

function validateTurnNumber(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw new BadRequestException(`${field} must be a positive integer.`);
  }
}

function isTurnStart(
  entry: BaselineEntry,
): entry is Required<Pick<BaselineEntry, 'ts' | 'turn' | 'trigger'>> &
  BaselineEntry {
  return (
    entry.type === 'turn_start' &&
    typeof entry.turn === 'number' &&
    typeof entry.trigger === 'string'
  );
}

function isRecordedToolCall(
  entry: BaselineEntry,
): entry is BaselineEntry & RecordedReplayToolCall {
  return (
    entry.type === 'tool_call' &&
    typeof entry.tool === 'string' &&
    Boolean(entry.input) &&
    typeof entry.input === 'object' &&
    'output' in entry
  );
}

export function buildSimulationEpisode(
  bundle: ShiftBundle,
  startTurn?: number,
  endTurn?: number,
): SimulationEpisode {
  const window = selectTurnWindow(bundle, startTurn, endTurn);
  const replayToolCalls = buildRecordedReplayToolCalls(bundle).filter(
    (call) =>
      call.turn >= window.selectedTurns[0].turn &&
      call.turn <= window.selectedTurns[window.selectedTurns.length - 1].turn,
  );

  return { ...window, replayToolCalls };
}

export function selectTurnWindow(
  bundle: ShiftBundle,
  startTurn?: number,
  endTurn?: number,
): Pick<SimulationEpisode, 'selectedTurns' | 'historyBoundary'> {
  validateTurnNumber(startTurn, 'startTurn');
  validateTurnNumber(endTurn, 'endTurn');

  if (startTurn !== undefined && endTurn !== undefined && startTurn > endTurn) {
    throw new BadRequestException('startTurn cannot be greater than endTurn.');
  }

  const allTurns = bundle.baseline
    .filter(isTurnStart)
    .sort((left, right) => left.turn - right.turn);

  if (allTurns.length === 0) {
    throw new BadRequestException('Shift contains no replayable turns.');
  }

  const firstRequestedTurn = startTurn ?? allTurns[0].turn;
  const lastRequestedTurn = endTurn ?? allTurns[allTurns.length - 1].turn;
  const selectedTurns = allTurns.filter(
    (turn) => turn.turn >= firstRequestedTurn && turn.turn <= lastRequestedTurn,
  );

  if (selectedTurns.length === 0) {
    throw new BadRequestException(
      `No turns found between ${firstRequestedTurn} and ${lastRequestedTurn}.`,
    );
  }

  const firstIndex = allTurns.findIndex(
    (turn) => turn.turn === selectedTurns[0].turn,
  );
  const historyBoundary = allTurns[firstIndex - 1]?.ts;
  return {
    selectedTurns,
    historyBoundary,
  };
}

export function buildRecordedReplayToolCalls(
  bundle: ShiftBundle,
): RecordedReplayToolCall[] {
  const normalizedTrace = normalizeTrace(bundle, { includeRawTelemetry: true });
  const turnNumberByRef = new Map(
    normalizedTrace
      .filter((entry) => entry.type === 'turn_start')
      .map(
        (entry) =>
          [
            entry.ref,
            typeof (entry.content as { turn?: unknown })?.turn === 'number'
              ? (entry.content as { turn: number }).turn
              : undefined,
          ] as const,
      ),
  );
  const turnByBaselineIndex = new Map(
    normalizedTrace
      .filter(
        (entry) =>
          entry.source === 'baseline' &&
          entry.type === 'tool_call' &&
          entry.turnRef,
      )
      .map(
        (entry) =>
          [entry.sourceIndex, turnNumberByRef.get(entry.turnRef!)] as const,
      ),
  );
  return bundle.baseline
    .map((entry, sourceIndex) => ({ entry, sourceIndex }))
    .filter(
      (
        item,
      ): item is {
        entry: BaselineEntry & RecordedReplayToolCall;
        sourceIndex: number;
      } => isRecordedToolCall(item.entry),
    )
    .map(({ entry, sourceIndex }) => ({
      turn: turnByBaselineIndex.get(sourceIndex),
      entry,
    }))
    .filter(
      (
        item,
      ): item is {
        turn: number;
        entry: BaselineEntry & RecordedReplayToolCall;
      } => typeof item.turn === 'number',
    )
    .map(({ entry, turn }) => ({
      turn,
      timestamp: entry.ts,
      tool: entry.tool,
      input: entry.input,
      output: entry.output,
      ok: entry.ok,
      error: entry.error,
    }));
}
