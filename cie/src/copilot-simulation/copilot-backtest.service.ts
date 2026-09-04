import { BadRequestException, Injectable } from '@nestjs/common';
import type { MayaRunResult } from '../mastra/maya/runner';
import { MayaJudgmentService } from '../mastra/maya/maya-judgment.service';
import {
  CandidateDecisionService,
  type CandidateDecision,
} from '../mastra/theo/candidate-decision.service';
import { TheoService } from '../mastra/theo/theo.service';
import type { BacktestCopilotDto } from './dto/backtest-copilot.dto';
import { CopilotOriginalService } from './copilot-original.service';
import { CopilotSimulationService } from './copilot-simulation.service';
import type {
  CopilotOriginalResponse,
  CopilotSimulationResponse,
  UpdatedPrompt,
} from './copilot-simulation.types';

export interface CopilotBacktestResponse {
  theo: Awaited<ReturnType<TheoService['diagnose']>>;
  oldReplay: CopilotOriginalResponse;
  candidateReplay: CopilotSimulationResponse;
  updatedPrompt: UpdatedPrompt;
  candidateDecision: CandidateDecision;
  maya: Pick<
    MayaRunResult,
    'runId' | 'artifactDirectory' | 'verdict' | 'judgment'
  > | null;
  mayaError: string | null;
}

@Injectable()
export class CopilotBacktestService {
  constructor(
    private readonly simulationService: CopilotSimulationService,
    private readonly originalService: CopilotOriginalService,
    private readonly mayaJudgmentService: MayaJudgmentService,
    private readonly theoService: TheoService,
    private readonly candidateDecisionService: CandidateDecisionService,
  ) {}

  async run(input: BacktestCopilotDto): Promise<CopilotBacktestResponse> {
    const callout = normalizeCallout(input.callout);
    const expectedBehavior = normalizeExpectedBehavior(input.expectedBehavior);
    if (input.replayMode !== undefined && input.replayMode !== 'candidate') {
      throw new BadRequestException(
        'Backtests judged by Maya require replayMode "candidate".',
      );
    }
    if (input.promptVersion !== undefined) {
      throw new BadRequestException(
        'Backtest promptVersion is created automatically by Theo.',
      );
    }

    const responseWindow = buildTheoResponseWindow(input);
    const theo = await this.theoService.diagnose({
      whatWentWrong: callout,
      expectedBehavior,
      badResponses: [responseWindow],
    });

    const [oldReplay, candidateReplay] = await Promise.all([
      this.originalService.getOriginal({
        jobId: input.jobId,
        startTurn: input.startTurn,
        endTurn: input.endTurn,
        source: input.baselineSource ?? 'shift',
        simulationNumber: input.baselineSimulationNumber,
      }),
      this.simulationService.simulate({
        jobId: input.jobId,
        startTurn: input.startTurn,
        endTurn: input.endTurn,
        replayMode: 'candidate',
        promptVersion: theo.candidatePromptVersion,
        callNiko: input.callNiko,
        debug: input.debug,
      }),
    ]);

    let result: MayaRunResult;
    try {
      result = await this.mayaJudgmentService.judge({
        callout,
        oldReplay,
        candidateReplay,
      });
    } catch (error) {
      const candidateDecision = await this.candidateDecisionService.get({
        jobId: candidateReplay.jobId,
        version: theo.candidatePromptVersion,
      });
      return {
        theo,
        oldReplay,
        candidateReplay,
        updatedPrompt: requireUpdatedPrompt(candidateReplay),
        candidateDecision: candidateDecision.decision,
        maya: null,
        mayaError: error instanceof Error ? error.message : String(error),
      };
    }

    const candidateDecision =
      await this.candidateDecisionService.recordEvaluation(
        {
          jobId: candidateReplay.jobId,
          version: theo.candidatePromptVersion,
        },
        {
          runId: result.runId,
          judgedAt: result.judgment.judgedAt,
          fixed: result.verdict.fixed,
          verdict: result.verdict.verdict,
          confidence: result.verdict.confidence,
          summary: result.verdict.summary,
        },
      );
    return {
      theo,
      oldReplay,
      candidateReplay,
      updatedPrompt: requireUpdatedPrompt(candidateReplay),
      candidateDecision: candidateDecision.decision,
      maya: {
        runId: result.runId,
        artifactDirectory: result.artifactDirectory,
        verdict: result.verdict,
        judgment: result.judgment,
      },
      mayaError: null,
    };
  }
}

function normalizeCallout(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('callout is required.');
  }
  return value.trim();
}

function normalizeExpectedBehavior(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException('expectedBehavior is required.');
  }
  return value.trim();
}

function buildTheoResponseWindow(input: BacktestCopilotDto) {
  const startTurn = requiredTurn(input.startTurn, 'startTurn');
  const endTurn = requiredTurn(input.endTurn, 'endTurn');
  if (startTurn > endTurn) {
    throw new BadRequestException('startTurn cannot be greater than endTurn.');
  }
  if (input.baselineSource === 'simulation') {
    const simulationNumber = Number(input.baselineSimulationNumber);
    if (!Number.isSafeInteger(simulationNumber) || simulationNumber < 1) {
      throw new BadRequestException(
        'baselineSimulationNumber must be a positive integer for simulation baselines.',
      );
    }
    return { simTarget: simulationNumber, startTurn, endTurn };
  }
  if (input.baselineSource !== undefined && input.baselineSource !== 'shift') {
    throw new BadRequestException(
      'baselineSource must be either shift or simulation.',
    );
  }
  return { jobId: input.jobId, startTurn, endTurn };
}

function requiredTurn(value: unknown, field: string): number {
  const turn = Number(value);
  if (!Number.isSafeInteger(turn) || turn < 1) {
    throw new BadRequestException(`${field} must be a positive integer.`);
  }
  return turn;
}

function requireUpdatedPrompt(
  candidateReplay: CopilotSimulationResponse,
): UpdatedPrompt {
  if (!candidateReplay.updatedPrompt) {
    throw new Error('Theo candidate replay did not report updatedPrompt.');
  }
  return candidateReplay.updatedPrompt;
}
