import type { NormalizedTraceEntry } from '../mastra/theo/trace-normalizer';
import type {
  DiagnoseMessageEvidenceDto,
  DiagnoseTurnWindowDto,
} from './dto/diagnose-response.dto';

export function fullJobWindow(startTurn: number, endTurn: number): DiagnoseTurnWindowDto {
  return { startTurn, endTurn, source: 'full-job' };
}

export function withFindingWindows<T extends {
  evidence?: Array<{ ref: string; turn?: number; summary: string }>;
  messages?: DiagnoseMessageEvidenceDto[];
}>(
  finding: T,
  trace: NormalizedTraceEntry[],
  diagnosisWindow: DiagnoseTurnWindowDto,
): T & { diagnosisWindow: DiagnoseTurnWindowDto; replayWindow: DiagnoseTurnWindowDto } {
  return {
    ...finding,
    diagnosisWindow,
    replayWindow: deriveReplayWindow(finding, trace, diagnosisWindow),
  };
}

function deriveReplayWindow(
  finding: {
    evidence?: Array<{ ref: string; turn?: number }>;
    messages?: DiagnoseMessageEvidenceDto[];
  },
  trace: NormalizedTraceEntry[],
  diagnosisWindow: DiagnoseTurnWindowDto,
): DiagnoseTurnWindowDto {
  const turns = new Set<number>();
  for (const item of finding.evidence ?? []) {
    if (typeof item.turn === 'number') turns.add(item.turn);
  }
  for (const item of finding.messages ?? []) {
    if (typeof item.turn === 'number') turns.add(item.turn);
  }

  if (!turns.size) {
    const turnByRef = traceTurnLookup(trace);
    for (const item of finding.evidence ?? []) {
      const turn = turnByRef.get(item.ref);
      if (turn) turns.add(turn);
    }
  }

  if (turns.size) {
    const minTurn = Math.min(...turns);
    const maxTurn = Math.max(...turns);
    return {
      startTurn: clampTurn(minTurn - 2, diagnosisWindow),
      endTurn: clampTurn(maxTurn + 3, diagnosisWindow),
      source: 'evidence',
    };
  }

  const fallbackSize = 15;
  return {
    startTurn: Math.max(diagnosisWindow.startTurn, diagnosisWindow.endTurn - fallbackSize + 1),
    endTurn: diagnosisWindow.endTurn,
    source: 'fallback',
  };
}

function traceTurnLookup(trace: NormalizedTraceEntry[]): Map<string, number> {
  const turnByTurnRef = new Map<string, number>();
  for (const entry of trace) {
    if (entry.type === 'turn_start' && isRecord(entry.content) && typeof entry.content.turn === 'number') {
      turnByTurnRef.set(entry.ref, entry.content.turn);
    }
  }

  const result = new Map<string, number>();
  for (const entry of trace) {
    const ownTurn = entry.type === 'turn_start' && isRecord(entry.content) && typeof entry.content.turn === 'number'
      ? entry.content.turn
      : undefined;
    const linkedTurn = entry.turnRef ? turnByTurnRef.get(entry.turnRef) : undefined;
    const turn = ownTurn ?? linkedTurn;
    if (turn) result.set(entry.ref, turn);
  }
  return result;
}

function clampTurn(turn: number, window: DiagnoseTurnWindowDto): number {
  return Math.min(window.endTurn, Math.max(window.startTurn, turn));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
