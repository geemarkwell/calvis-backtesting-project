import type { CopilotOriginalResponse } from '../copilot-simulation/copilot-simulation.types';
import type { SavedTestSpecDto } from '../test-specs/dto/test-spec.dto';

export interface TestEvaluationEvidencePacket {
  testSpec: SavedTestSpecDto;
  trace: {
    jobId: string;
    startTurn: number;
    endTurn: number;
    replayMode: string;
    turns: TestEvaluationEvidenceTurn[];
  };
}

export interface TestEvaluationEvidenceTurn {
  ref: string;
  turn: number;
  trigger: string;
  timestamp: string;
  guardMessages: { ref: string; text: string }[];
  copilotMessages: { ref: string; text: string }[];
  actions: { ref: string; tool: string; input: Record<string, unknown> }[];
  silent: boolean;
}

export function buildTestEvaluationEvidencePacket(
  testSpec: SavedTestSpecDto,
  replay: CopilotOriginalResponse,
): TestEvaluationEvidencePacket {
  return {
    testSpec,
    trace: {
      jobId: replay.jobId,
      startTurn: replay.startTurn,
      endTurn: replay.endTurn,
      replayMode: replay.replayMode,
      turns: replay.turns.map((turn) => ({
        ref: `trace:turn:${turn.turn}`,
        turn: turn.turn,
        trigger: turn.trigger,
        timestamp: turn.timestamp,
        guardMessages: turn.guardMessages.map((text, index) => ({
          ref: `trace:turn:${turn.turn}:guard-message:${index}`,
          text,
        })),
        copilotMessages: turn.copilotMessages.map((text, index) => ({
          ref: `trace:turn:${turn.turn}:copilot-message:${index}`,
          text,
        })),
        actions: turn.toolCalls.map((action, index) => ({
          ref: `trace:turn:${turn.turn}:action:${index}`,
          tool: action.tool,
          input: action.input,
        })),
        silent: turn.silent,
      })),
    },
  };
}
