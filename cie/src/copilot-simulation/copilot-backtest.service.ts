import { BadRequestException, Injectable } from '@nestjs/common';
import type { MayaRunResult } from '../mastra/maya/runner';
import { MayaJudgmentService } from '../mastra/maya/maya-judgment.service';
import {
  CandidateDecisionService,
  type CandidateDecision,
} from '../mastra/theo/candidate-decision.service';
import { PipelineLogger } from '../common/telemetry/pipeline-logger';
import { createBacktestDebuggingRun } from '../backtestDebugging/logger';
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

    const pipeline = new PipelineLogger();
    const debugRun = await createBacktestDebuggingRun();
    pipeline.stage('BACKTEST').start({
      runId: pipeline.runId,
      artifactDirectory: pipeline.artifactDirectory,
      backtestDebuggingRunId: debugRun.runId,
      backtestDebuggingDirectory: debugRun.artifactDirectory,
      jobId: input.jobId,
      startTurn: input.startTurn,
      endTurn: input.endTurn,
    });
    await debugRun.writeStage('01-raw-backtest-input.json', input);

    const responseWindow = buildTheoResponseWindow(input);
    const useCompactContext = normalizeCompactContext(input.useCompactContext);
    await debugRun.writeStage('02-normalized-backtest-input.json', {
      callout,
      expectedBehavior,
      responseWindow,
      useCompactContext,
    });
    const theoInput = {
      whatWentWrong: callout,
      expectedBehavior,
      badResponses: [responseWindow],
      useCompactContext,
    };
    await debugRun.writeStage('03-theo-diagnose-input.json', theoInput);

    let theo: Awaited<ReturnType<TheoService['diagnose']>>;
    try {
      pipeline.stage('THEO').start({ compact: useCompactContext });
      theo = await this.theoService.diagnose(theoInput, debugRun);
      await debugRun.writeStage('04-theo-diagnose-output.json', theo);
      pipeline.stage('THEO').success({
        theoRunId: theo.runId,
        candidateKind: theo.candidate?.kind,
        canReplay: theo.canReplay,
        candidatePromptVersion: theo.candidatePromptVersion,
      });
    } catch (error) {
      await debugRun.writeStage('99-theo-diagnose-error.json', errorArtifact(error));
      pipeline.stage('THEO').error(error);
      pipeline.stage('BACKTEST').error(error, { failedPhase: 'THEO' });
      throw error;
    }

    if (theo.canReplay === false || !theo.candidatePromptVersion) {
      await debugRun.writeStage('99-manual-validation-required.json', {
        candidateKind: theo.candidate?.kind ?? 'manual',
        runId: theo.runId,
        artifactDirectory: theo.artifactDirectory,
      });
      pipeline.stage('THEO').skip({
        reason: 'manual_validation_required',
        candidateKind: theo.candidate?.kind ?? 'manual',
      });
      pipeline.stage('BACKTEST').error('Manual validation required.', {
        failedPhase: 'THEO',
      });
      throw new BadRequestException({
        message: `Theo produced a ${theo.candidate?.kind ?? 'manual'} candidate that requires manual validation.`,
        code: 'MANUAL_VALIDATION_REQUIRED',
        phase: 'theo',
        retryable: false,
        candidateKind: theo.candidate?.kind ?? 'manual',
        runId: theo.runId,
        artifactDirectory: theo.artifactDirectory,
      });
    }
    const candidatePromptVersion = theo.candidatePromptVersion;
    const originalReplayInput = {
      jobId: input.jobId,
      startTurn: input.startTurn,
      endTurn: input.endTurn,
      source: input.baselineSource ?? 'shift',
      simulationNumber: input.baselineSimulationNumber,
    };
    const candidateReplayInput = {
      jobId: input.jobId,
      startTurn: input.startTurn,
      endTurn: input.endTurn,
      replayMode: 'candidate' as const,
      promptVersion: candidatePromptVersion,
      callNiko: input.callNiko,
      debug: input.debug,
      useCompactContext,
      pipelineLogger: pipeline,
    };
    await Promise.all([
      debugRun.writeStage('05-original-replay-input.json', originalReplayInput),
      debugRun.writeStage('06-candidate-replay-input.json', candidateReplayInput),
    ]);

    const [oldReplay, candidateReplay] = await Promise.all([
      withPipelinePhase(pipeline, 'ORIGINAL', () =>
        this.originalService.getOriginal(originalReplayInput),
      ),
      withPipelinePhase(pipeline, 'CANDIDATE', () =>
        this.simulationService.simulate(candidateReplayInput),
      ),
    ]).catch(async (error) => {
      await debugRun.writeStage('99-replay-error.json', errorArtifact(error));
      pipeline.stage('BACKTEST').error(error, { failedPhase: 'REPLAY' });
      throw error;
    });
    await Promise.all([
      debugRun.writeStage('07-original-replay-output.json', oldReplay),
      debugRun.writeStage('08-candidate-replay-output.json', candidateReplay),
    ]);

    const mayaInput = {
      callout,
      oldReplay,
      candidateReplay,
      useCompactContext,
    };
    await debugRun.writeStage('09-maya-judge-input.json', mayaInput);

    let result: MayaRunResult;
    try {
      pipeline.stage('MAYA').start();
      result = await this.mayaJudgmentService.judge(mayaInput, debugRun);
      await debugRun.writeStage('10-maya-judge-output.json', result);
      pipeline.stage('MAYA').success({
        mayaRunId: result.runId,
        fixed: result.verdict.fixed,
      });
    } catch (error) {
      await debugRun.writeStage('10-maya-judge-error.json', errorArtifact(error));
      pipeline.stage('MAYA').error(error);
      const candidateDecisionGetInput = {
        jobId: candidateReplay.jobId,
        version: candidatePromptVersion,
      };
      await debugRun.writeStage(
        '11-candidate-decision-get-input.json',
        candidateDecisionGetInput,
      );
      const candidateDecision = await this.candidateDecisionService.get(
        candidateDecisionGetInput,
      );
      pipeline.stage('BACKTEST').success({ maya: 'error_recorded' });
      const response = {
        theo,
        oldReplay,
        candidateReplay,
        updatedPrompt: requireUpdatedPrompt(candidateReplay),
        candidateDecision: candidateDecision.decision,
        maya: null,
        mayaError: error instanceof Error ? error.message : String(error),
      };
      await debugRun.writeStage('12-backtest-response.json', response);
      return response;
    }

    pipeline.stage('BACKTEST').info('CANDIDATE_DECISION_START');
    const candidateDecisionKey = {
      jobId: candidateReplay.jobId,
      version: candidatePromptVersion,
    };
    const candidateDecisionEvaluation = {
      runId: result.runId,
      judgedAt: result.judgment.judgedAt,
      fixed: result.verdict.fixed,
      verdict: result.verdict.verdict,
      confidence: result.verdict.confidence,
      summary: result.verdict.summary,
    };
    await debugRun.writeStage('11-candidate-decision-record-input.json', {
      candidate: candidateDecisionKey,
      evaluation: candidateDecisionEvaluation,
    });
    const candidateDecision =
      await this.candidateDecisionService.recordEvaluation(
        candidateDecisionKey,
        candidateDecisionEvaluation,
      );
    pipeline.stage('BACKTEST').success({ fixed: result.verdict.fixed });
    const response = {
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
    await debugRun.writeStage('12-backtest-response.json', response);
    return response;
  }
}

function errorArtifact(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(isRecord(error) && 'cause' in error
        ? { cause: errorArtifact(error.cause) }
        : {}),
    };
  }
  return { message: String(error) };
}

async function withPipelinePhase<T>(
  pipeline: PipelineLogger,
  stage: string,
  work: () => Promise<T>,
): Promise<T> {
  pipeline.stage(stage).start();
  try {
    const result = await work();
    pipeline.stage(stage).success(summarizePhaseResult(result));
    return result;
  } catch (error) {
    pipeline.stage(stage).error(error);
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function summarizePhaseResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') {
    return {};
  }
  const record = result as Record<string, unknown>;
  return {
    jobId: record.jobId,
    startTurn: record.startTurn,
    endTurn: record.endTurn,
    turnCount: Array.isArray(record.turns) ? record.turns.length : undefined,
  };
}

function normalizeCompactContext(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw new BadRequestException('useCompactContext must be a boolean.');
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
