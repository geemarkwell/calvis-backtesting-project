import { Injectable } from '@nestjs/common';
import { AnalyticsSchema } from './analytics.schema';
import type { LensPerformanceQueryDto, LensPerformanceResponseDto } from './dto/lens-performance.dto';
import type { RecordBacktestRunDto, RecordDiagnosisRunDto } from './dto/record-analytics.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly schema: AnalyticsSchema) {}

  async recordDiagnosisRun(dto: RecordDiagnosisRunDto): Promise<void> {
    const createdAt = new Date().toISOString();
    const diagnosis = dto.diagnosis;
    await this.schema.upsertDiagnosisRun({
      runId: diagnosis.runId,
      jobId: diagnosis.jobId,
      startTurn: diagnosis.startTurn,
      endTurn: diagnosis.endTurn,
      replaySource: null,
      summary: diagnosis.summary,
      noFindings: diagnosis.noFindings,
      createdAt,
    });

    const records = diagnosis.evaluatorReports.flatMap((report) =>
      report.findings.map((finding) => ({
        diagnosisRunId: diagnosis.runId,
        findingId: finding.id,
        lensId: report.lens?.id ?? report.evaluatorId,
        lensName: report.lens?.name ?? report.evaluatorName,
        severity: finding.severity,
        confidence: finding.confidence,
        category: finding.category,
        title: finding.title,
        suggestedCandidateKind: finding.suggestedCandidateKind ?? null,
        replayableHint: finding.replayableHint ?? null,
        requiresManualValidationHint: finding.requiresManualValidationHint ?? null,
        createdAt,
      })),
    );
    await this.schema.upsertDiagnosisFindings(records);
  }

  async recordBacktestRun(dto: RecordBacktestRunDto): Promise<void> {
    const context = dto.input.diagnosisContext;
    const response = dto.response;
    const backtestRunId = response.maya?.runId ?? response.theo.runId;
    const lens = await this.schema.findFindingLens({
      diagnosisRunId: context?.diagnosisRunId,
      findingId: context?.patternId,
    });
    await this.schema.insertBacktestRun({
      backtestRunId,
      diagnosisRunId: context?.diagnosisRunId ?? null,
      diagnosisFindingId: context?.patternId ?? null,
      jobId: String(dto.input.jobId),
      candidateKind: response.theo.candidate?.kind ?? context?.suggestedCandidateKind ?? null,
      createdAt: new Date().toISOString(),
    });
    if (!response.maya) {
      return;
    }
    await this.schema.insertMayaEvaluation({
      mayaRunId: response.maya.runId,
      backtestRunId,
      diagnosisRunId: context?.diagnosisRunId ?? null,
      diagnosisFindingId: context?.patternId ?? null,
      lensId: lens?.lensId ?? null,
      lensName: lens?.lensName ?? null,
      fixed: response.maya.verdict.fixed,
      verdict: response.maya.verdict.verdict,
      confidence: response.maya.verdict.confidence,
      judgedAt: response.maya.judgment.judgedAt,
    });
  }

  async lensPerformance(dto: LensPerformanceQueryDto): Promise<LensPerformanceResponseDto> {
    const range = dto.range ?? 'day';
    const lenses = await this.schema.lensPerformance();
    const trend = await this.schema.mayaOutcomeTrend(range);
    const mayaEvalCount = lenses.reduce((total, item) => total + item.mayaEvalCount, 0);
    const mayaPassCount = lenses.reduce((total, item) => total + item.mayaPassCount, 0);
    const mayaFailCount = lenses.reduce((total, item) => total + item.mayaFailCount, 0);
    return {
      range,
      generatedAt: new Date().toISOString(),
      summary: {
        diagnosisFindingCount: lenses.reduce((total, item) => total + item.diagnosisFindingCount, 0),
        mayaEvalCount,
        mayaPassCount,
        mayaFailCount,
        mayaPassRate: mayaEvalCount > 0 ? mayaPassCount / mayaEvalCount : null,
      },
      lenses,
      mostDiagnosisFailures: [...lenses].sort(by('diagnosisFindingCount')).slice(0, 6),
      mostMayaPasses: [...lenses].sort(by('mayaPassCount')).slice(0, 6),
      mostMayaFails: [...lenses].sort(by('mayaFailCount')).slice(0, 6),
      mayaOutcomeTrend: trend,
    };
  }
}

function by(key: 'diagnosisFindingCount' | 'mayaPassCount' | 'mayaFailCount') {
  return (left: { [K in typeof key]: number }, right: { [K in typeof key]: number }) =>
    right[key] - left[key];
}
