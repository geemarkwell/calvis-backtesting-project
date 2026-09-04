import { baseToolName } from '../../copilot-simulation/output-comparison';
import type {
  CopilotOutputSnapshot,
  CopilotSimulationGuardReply,
  CopilotSimulationResponse,
  CopilotSimulationTurn,
  ShiftEvent,
} from '../../copilot-simulation/copilot-simulation.types';
import { computeMayaMeasurements, type MayaMeasurements } from './measurements';

export type MayaTrajectoryName = 'historical' | 'old' | 'candidate';

export interface MayaEvidenceEvent {
  ref: string;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

export interface MayaEvidenceGuardReply {
  ref: string;
  timestamp: string;
  message: string | null;
  source: 'historical' | 'simulated';
  historicalMessage: string;
}

export interface MayaEvidenceMessage {
  ref: string;
  timestamp: string;
  text: string;
}

export interface MayaEvidenceAction {
  ref: string;
  timestamp: string;
  tool: string;
  input: Record<string, unknown>;
}

export interface MayaEvidenceTurn {
  ref: string;
  turn: number;
  trigger: string;
  timestamp: string;
  events: MayaEvidenceEvent[];
  guardReplies: MayaEvidenceGuardReply[];
  copilotMessages: MayaEvidenceMessage[];
  actions: MayaEvidenceAction[];
  silent: boolean;
  skipped: boolean;
}

export interface MayaEvidenceTrajectory {
  name: MayaTrajectoryName;
  turns: MayaEvidenceTurn[];
}

export interface MayaEvidencePacket {
  callout: string;
  jobId: string;
  startTurn: number;
  endTurn: number;
  trajectories: Record<MayaTrajectoryName, MayaEvidenceTrajectory>;
  warnings: string[];
}

export interface BuildMayaEvidencePacketInput {
  callout: string;
  oldReplay: CopilotSimulationResponse;
  candidateReplay: CopilotSimulationResponse;
}

export interface MayaJudgeInput {
  evidence: MayaEvidencePacket;
  measurements: MayaMeasurements;
}

/**
 * Builds the deliberately bounded, prompt-blind evidence given to Maya.
 * Construction is allow-list based so replay debug data and prompt-edit context
 * cannot leak into the judge input.
 */
export function buildMayaEvidencePacket({
  callout,
  oldReplay,
  candidateReplay,
}: BuildMayaEvidencePacketInput): MayaEvidencePacket {
  validateComparableReplays(oldReplay, candidateReplay);

  const warnings = collectParityWarnings(oldReplay, candidateReplay);

  return {
    callout: requireCallout(callout),
    jobId: oldReplay.jobId,
    startTurn: oldReplay.startTurn,
    endTurn: oldReplay.endTurn,
    trajectories: {
      historical: buildTrajectory(
        'historical',
        oldReplay.turns,
        (turn) => turn.historicalCopilotOutput,
        historicalGuardReplies,
        () => false,
      ),
      old: buildTrajectory(
        'old',
        oldReplay.turns,
        (turn) => turn.candidateCopilotOutput,
        (turn) => turn.guardReplies,
        (turn) => turn.skipped,
      ),
      candidate: buildTrajectory(
        'candidate',
        candidateReplay.turns,
        (turn) => turn.candidateCopilotOutput,
        (turn) => turn.guardReplies,
        (turn) => turn.skipped,
      ),
    },
    warnings,
  };
}

export function buildMayaJudgeInput(
  input: BuildMayaEvidencePacketInput,
): MayaJudgeInput {
  const evidence = buildMayaEvidencePacket(input);
  return {
    evidence,
    measurements: computeMayaMeasurements(evidence),
  };
}

function validateComparableReplays(
  oldReplay: CopilotSimulationResponse,
  candidateReplay: CopilotSimulationResponse,
): void {
  if (oldReplay.replayMode !== 'original') {
    throw new Error('Old replay must use replayMode "original".');
  }
  if (candidateReplay.replayMode !== 'candidate') {
    throw new Error('Candidate replay must use replayMode "candidate".');
  }
  if (oldReplay.jobId !== candidateReplay.jobId) {
    throw new Error(
      `Replay job IDs differ: ${oldReplay.jobId} versus ${candidateReplay.jobId}.`,
    );
  }
  if (
    oldReplay.startTurn !== candidateReplay.startTurn ||
    oldReplay.endTurn !== candidateReplay.endTurn
  ) {
    throw new Error(
      `Replay bounds differ: ${oldReplay.startTurn}-${oldReplay.endTurn} versus ${candidateReplay.startTurn}-${candidateReplay.endTurn}.`,
    );
  }
  if (oldReplay.turns.length !== candidateReplay.turns.length) {
    throw new Error(
      `Replay turn counts differ: ${oldReplay.turns.length} versus ${candidateReplay.turns.length}.`,
    );
  }
  if (oldReplay.turns.length === 0) {
    throw new Error('Comparable replays must contain at least one turn.');
  }

  const seenTurns = new Set<number>();
  for (const [index, oldTurn] of oldReplay.turns.entries()) {
    const candidateTurn = candidateReplay.turns[index];
    if (seenTurns.has(oldTurn.turn)) {
      throw new Error(`Old replay contains duplicate turn ${oldTurn.turn}.`);
    }
    seenTurns.add(oldTurn.turn);
    if (oldTurn.turn !== candidateTurn.turn) {
      throw new Error(
        `Replay turn numbers differ at index ${index}: ${oldTurn.turn} versus ${candidateTurn.turn}.`,
      );
    }
    if (oldTurn.trigger !== candidateTurn.trigger) {
      throw new Error(
        `Replay triggers differ on turn ${oldTurn.turn}: ${oldTurn.trigger} versus ${candidateTurn.trigger}.`,
      );
    }
  }
  if (
    new Set(candidateReplay.turns.map((turn) => turn.turn)).size !==
    candidateReplay.turns.length
  ) {
    throw new Error('Candidate replay contains duplicate turn numbers.');
  }
}

function collectParityWarnings(
  oldReplay: CopilotSimulationResponse,
  candidateReplay: CopilotSimulationResponse,
): string[] {
  const warnings: string[] = [];
  if (
    !valuesEqual(
      oldReplay.modelConfiguration,
      candidateReplay.modelConfiguration,
    )
  ) {
    warnings.push(
      `Copilot model configurations differ: old=${JSON.stringify(oldReplay.modelConfiguration)}, candidate=${JSON.stringify(candidateReplay.modelConfiguration)}.`,
    );
  }

  const hasCompleteDebugContext = [
    ...oldReplay.turns,
    ...candidateReplay.turns,
  ].every((turn) => turn.debug);
  if (!hasCompleteDebugContext) {
    warnings.push(
      'Full replay context parity could not be independently verified because one or both replay responses omit debug context.',
    );
  }

  for (const [index, oldTurn] of oldReplay.turns.entries()) {
    const candidateTurn = candidateReplay.turns[index];
    if (oldTurn.timestamp !== candidateTurn.timestamp) {
      warnings.push(
        `Turn ${oldTurn.turn} timestamps differ: old=${oldTurn.timestamp}, candidate=${candidateTurn.timestamp}.`,
      );
    }
    if (!valuesEqual(oldTurn.shiftEvents, candidateTurn.shiftEvents)) {
      warnings.push(
        `Turn ${oldTurn.turn} received different non-guard shift events across replays.`,
      );
    }
  }

  collectTrajectoryWarnings('old', oldReplay.turns, warnings);
  collectTrajectoryWarnings('candidate', candidateReplay.turns, warnings);
  return warnings;
}

function collectTrajectoryWarnings(
  trajectory: Exclude<MayaTrajectoryName, 'historical'>,
  turns: CopilotSimulationTurn[],
  warnings: string[],
): void {
  for (const turn of turns) {
    if (turn.skipped) {
      warnings.push(
        `${trajectory} turn ${turn.turn} was skipped because a divergent guard-message turn had no simulated reply.`,
      );
    }
    for (const reply of turn.guardReplies) {
      if (reply.source !== 'simulated') {
        continue;
      }
      warnings.push(
        `${trajectory} turn ${turn.turn} uses a simulated guard reply; real guard behavior may differ.`,
      );
      if (reply.reply === null) {
        warnings.push(
          `${trajectory} turn ${turn.turn} has a null simulated guard reply.`,
        );
      }
    }
  }
}

function buildTrajectory(
  name: MayaTrajectoryName,
  turns: CopilotSimulationTurn[],
  outputForTurn: (turn: CopilotSimulationTurn) => CopilotOutputSnapshot,
  repliesForTurn: (
    turn: CopilotSimulationTurn,
  ) => CopilotSimulationGuardReply[],
  skippedForTurn: (turn: CopilotSimulationTurn) => boolean,
): MayaEvidenceTrajectory {
  return {
    name,
    turns: turns.map((turn) => {
      const turnRef = `${name}:turn:${turn.turn}`;
      const output = outputForTurn(turn);
      return {
        ref: turnRef,
        turn: turn.turn,
        trigger: turn.trigger,
        timestamp: turn.timestamp,
        events: turn.shiftEvents.map((event, index) =>
          buildEvent(`${turnRef}:event:${index}`, event),
        ),
        guardReplies: repliesForTurn(turn).map((reply, index) => ({
          ref: `${turnRef}:guard-reply:${index}`,
          timestamp: turn.timestamp,
          message: reply.reply,
          source: reply.source,
          historicalMessage: reply.historicalReply,
        })),
        copilotMessages: output.messages.map((text, index) => ({
          ref: `${turnRef}:message:${index}`,
          timestamp: turn.timestamp,
          text,
        })),
        actions: output.actions.map((action, index) => ({
          ref: `${turnRef}:action:${index}`,
          timestamp: turn.timestamp,
          tool: baseToolName(action.tool),
          input: copyRecord(action.input),
        })),
        silent: output.silent,
        skipped: skippedForTurn(turn),
      };
    }),
  };
}

function historicalGuardReplies(
  turn: CopilotSimulationTurn,
): CopilotSimulationGuardReply[] {
  return turn.guardReplies.map((reply) => ({
    reply: reply.historicalReply,
    source: 'historical',
    historicalReply: reply.historicalReply,
  }));
}

function buildEvent(ref: string, event: ShiftEvent): MayaEvidenceEvent {
  const { ts, type, ...data } = event;
  return {
    ref,
    timestamp: ts,
    type,
    data: copyRecord(data),
  };
}

function copyRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireCallout(callout: string): string {
  const normalized = callout.trim();
  if (!normalized) {
    throw new Error('Callout must not be empty.');
  }
  return normalized;
}
