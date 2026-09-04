import { BadRequestException, Injectable } from '@nestjs/common';
import type { CopilotSimulationResponse } from '../../copilot-simulation/copilot-simulation.types';
import { listMayaJudgments } from './judgment-history';
import { runMaya } from './runner';

export interface MayaJudgmentQuery {
  jobId?: string | number;
}

export interface MayaJudgeRequest {
  callout: string;
  oldReplay: CopilotSimulationResponse;
  candidateReplay: CopilotSimulationResponse;
}

@Injectable()
export class MayaJudgmentService {
  async judge(input: unknown) {
    const request = parseJudgeRequest(input);
    return runMaya(request);
  }

  getHistory(input: MayaJudgmentQuery) {
    const jobId = String(input.jobId ?? '').trim();
    if (!/^\d+$/.test(jobId)) {
      throw new BadRequestException('jobId must contain digits only.');
    }
    return listMayaJudgments({ jobId });
  }
}

function parseJudgeRequest(input: unknown): MayaJudgeRequest {
  if (!isRecord(input)) {
    throw new BadRequestException('Maya judge input must be an object.');
  }

  const callout = typeof input.callout === 'string' ? input.callout.trim() : '';
  if (!callout) {
    throw new BadRequestException('callout is required.');
  }
  if (!isReplay(input.oldReplay)) {
    throw new BadRequestException('oldReplay is invalid.');
  }
  if (!isReplay(input.candidateReplay)) {
    throw new BadRequestException('candidateReplay is invalid.');
  }
  if (input.oldReplay.replayMode !== 'original') {
    throw new BadRequestException('oldReplay must use replayMode "original".');
  }
  if (input.candidateReplay.replayMode !== 'candidate') {
    throw new BadRequestException(
      'candidateReplay must use replayMode "candidate".',
    );
  }
  if (input.oldReplay.jobId !== input.candidateReplay.jobId) {
    throw new BadRequestException('Replay job IDs must match.');
  }
  if (
    input.oldReplay.startTurn !== input.candidateReplay.startTurn ||
    input.oldReplay.endTurn !== input.candidateReplay.endTurn
  ) {
    throw new BadRequestException('Replay turn bounds must match.');
  }

  return {
    callout,
    oldReplay: input.oldReplay as unknown as CopilotSimulationResponse,
    candidateReplay:
      input.candidateReplay as unknown as CopilotSimulationResponse,
  };
}

function isReplay(value: unknown): value is Record<string, unknown> & {
  jobId: string;
  startTurn: number;
  endTurn: number;
  replayMode: string;
} {
  return (
    isRecord(value) &&
    /^\d+$/.test(typeof value.jobId === 'string' ? value.jobId : '') &&
    Number.isSafeInteger(value.startTurn) &&
    Number.isSafeInteger(value.endTurn) &&
    Array.isArray(value.turns) &&
    isRecord(value.modelConfiguration)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
