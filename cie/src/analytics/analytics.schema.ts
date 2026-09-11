import { Injectable } from '@nestjs/common';
import { createClient, type Client } from '@libsql/client';
import { resolve } from 'node:path';
import type { LensPerformanceRowDto, MayaOutcomeBucketDto } from './dto/lens-performance.dto';

export interface DiagnosisRunRecord {
  runId: string;
  jobId: string;
  startTurn: number;
  endTurn: number;
  replaySource: string | null;
  summary: string;
  noFindings: boolean;
  createdAt: string;
}

export interface DiagnosisFindingRecord {
  diagnosisRunId: string;
  findingId: string;
  lensId: string;
  lensName: string;
  severity: string;
  confidence: number;
  category: string;
  title: string;
  suggestedCandidateKind: string | null;
  replayableHint: boolean | null;
  requiresManualValidationHint: boolean | null;
  createdAt: string;
}

export interface BacktestRunRecord {
  backtestRunId: string;
  diagnosisRunId: string | null;
  diagnosisFindingId: string | null;
  jobId: string;
  candidateKind: string | null;
  createdAt: string;
}

export interface MayaEvaluationRecord {
  mayaRunId: string;
  backtestRunId: string;
  diagnosisRunId: string | null;
  diagnosisFindingId: string | null;
  lensId: string | null;
  lensName: string | null;
  fixed: boolean;
  verdict: string;
  confidence: number | null;
  judgedAt: string;
}

@Injectable()
export class AnalyticsSchema {
  private readonly db: Client;
  private initialized?: Promise<void>;

  constructor() {
    this.db = createClient({ url: `file:${resolve(process.cwd(), 'cie-analytics.db')}` });
  }

  async upsertDiagnosisRun(record: DiagnosisRunRecord): Promise<void> {
    await this.ensureInitialized();
    await this.db.execute({
      sql: `INSERT INTO diagnosis_runs
        (run_id, job_id, start_turn, end_turn, replay_source, summary, no_findings, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
          job_id = excluded.job_id,
          start_turn = excluded.start_turn,
          end_turn = excluded.end_turn,
          replay_source = excluded.replay_source,
          summary = excluded.summary,
          no_findings = excluded.no_findings`,
      args: [
        record.runId,
        record.jobId,
        record.startTurn,
        record.endTurn,
        record.replaySource,
        record.summary,
        bool(record.noFindings),
        record.createdAt,
      ],
    });
  }

  async upsertDiagnosisFindings(records: DiagnosisFindingRecord[]): Promise<void> {
    await this.ensureInitialized();
    for (const record of records) {
      await this.db.execute({
        sql: `INSERT INTO diagnosis_findings
          (diagnosis_run_id, finding_id, lens_id, lens_name, severity, confidence,
           category, title, suggested_candidate_kind, replayable_hint,
           requires_manual_validation_hint, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(diagnosis_run_id, finding_id) DO UPDATE SET
            lens_id = excluded.lens_id,
            lens_name = excluded.lens_name,
            severity = excluded.severity,
            confidence = excluded.confidence,
            category = excluded.category,
            title = excluded.title,
            suggested_candidate_kind = excluded.suggested_candidate_kind,
            replayable_hint = excluded.replayable_hint,
            requires_manual_validation_hint = excluded.requires_manual_validation_hint`,
        args: [
          record.diagnosisRunId,
          record.findingId,
          record.lensId,
          record.lensName,
          record.severity,
          record.confidence,
          record.category,
          record.title,
          record.suggestedCandidateKind,
          nullableBool(record.replayableHint),
          nullableBool(record.requiresManualValidationHint),
          record.createdAt,
        ],
      });
    }
  }

  async insertBacktestRun(record: BacktestRunRecord): Promise<void> {
    await this.ensureInitialized();
    await this.db.execute({
      sql: `INSERT OR REPLACE INTO backtest_runs
        (backtest_run_id, diagnosis_run_id, diagnosis_finding_id, job_id, candidate_kind, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        record.backtestRunId,
        record.diagnosisRunId,
        record.diagnosisFindingId,
        record.jobId,
        record.candidateKind,
        record.createdAt,
      ],
    });
  }

  async insertMayaEvaluation(record: MayaEvaluationRecord): Promise<void> {
    await this.ensureInitialized();
    await this.db.execute({
      sql: `INSERT OR REPLACE INTO maya_evaluations
        (maya_run_id, backtest_run_id, diagnosis_run_id, diagnosis_finding_id,
         lens_id, lens_name, fixed, verdict, confidence, judged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        record.mayaRunId,
        record.backtestRunId,
        record.diagnosisRunId,
        record.diagnosisFindingId,
        record.lensId,
        record.lensName,
        bool(record.fixed),
        record.verdict,
        record.confidence,
        record.judgedAt,
      ],
    });
  }

  async findFindingLens(input: {
    diagnosisRunId?: string;
    findingId?: string;
  }): Promise<{ lensId: string; lensName: string } | null> {
    await this.ensureInitialized();
    if (!input.diagnosisRunId || !input.findingId) return null;
    const result = await this.db.execute({
      sql: `SELECT lens_id, lens_name FROM diagnosis_findings
        WHERE diagnosis_run_id = ? AND finding_id = ? LIMIT 1`,
      args: [input.diagnosisRunId, input.findingId],
    });
    const row = result.rows[0];
    if (!row) return null;
    return { lensId: String(row.lens_id), lensName: String(row.lens_name) };
  }

  async lensPerformance(): Promise<LensPerformanceRowDto[]> {
    await this.ensureInitialized();
    const result = await this.db.execute(`SELECT
        lens_id,
        MAX(lens_name) AS lens_name,
        COUNT(*) AS diagnosis_finding_count,
        COALESCE(SUM(maya_eval_count), 0) AS maya_eval_count,
        COALESCE(SUM(maya_pass_count), 0) AS maya_pass_count,
        COALESCE(SUM(maya_fail_count), 0) AS maya_fail_count
      FROM (
        SELECT
          df.lens_id,
          df.lens_name,
          df.diagnosis_run_id,
          df.finding_id,
          COUNT(me.maya_run_id) AS maya_eval_count,
          SUM(CASE WHEN me.fixed = 1 THEN 1 ELSE 0 END) AS maya_pass_count,
          SUM(CASE WHEN me.fixed = 0 THEN 1 ELSE 0 END) AS maya_fail_count
        FROM diagnosis_findings df
        LEFT JOIN maya_evaluations me
          ON me.diagnosis_run_id = df.diagnosis_run_id
         AND me.diagnosis_finding_id = df.finding_id
        GROUP BY df.lens_id, df.lens_name, df.diagnosis_run_id, df.finding_id
      ) grouped
      GROUP BY lens_id
      ORDER BY diagnosis_finding_count DESC, lens_id ASC`);
    return result.rows.map((row) => {
      const evals = numberOf(row.maya_eval_count);
      const passes = numberOf(row.maya_pass_count);
      return {
        lensId: String(row.lens_id),
        lensName: String(row.lens_name ?? row.lens_id),
        diagnosisFindingCount: numberOf(row.diagnosis_finding_count),
        mayaEvalCount: evals,
        mayaPassCount: passes,
        mayaFailCount: numberOf(row.maya_fail_count),
        mayaPassRate: evals > 0 ? passes / evals : null,
      };
    });
  }

  async mayaOutcomeTrend(bucket: 'day' | 'week'): Promise<MayaOutcomeBucketDto[]> {
    await this.ensureInitialized();
    const expression = bucket === 'week'
      ? `date(judged_at, '-' || ((strftime('%w', judged_at) + 6) % 7) || ' days')`
      : `date(judged_at)`;
    const result = await this.db.execute(`SELECT
        ${expression} AS bucket,
        SUM(CASE WHEN fixed = 1 THEN 1 ELSE 0 END) AS pass_count,
        SUM(CASE WHEN fixed = 0 THEN 1 ELSE 0 END) AS fail_count,
        COUNT(*) AS total_count
      FROM maya_evaluations
      GROUP BY ${expression}
      ORDER BY bucket ASC`);
    return result.rows.map((row) => ({
      bucket: String(row.bucket),
      passCount: numberOf(row.pass_count),
      failCount: numberOf(row.fail_count),
      totalCount: numberOf(row.total_count),
    }));
  }

  private ensureInitialized(): Promise<void> {
    this.initialized ??= this.initialize();
    return this.initialized;
  }

  private async initialize(): Promise<void> {
    await this.db.batch([
      `CREATE TABLE IF NOT EXISTS diagnosis_runs (
        run_id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        start_turn INTEGER NOT NULL,
        end_turn INTEGER NOT NULL,
        replay_source TEXT,
        summary TEXT NOT NULL,
        no_findings INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS diagnosis_findings (
        diagnosis_run_id TEXT NOT NULL,
        finding_id TEXT NOT NULL,
        lens_id TEXT NOT NULL,
        lens_name TEXT NOT NULL,
        severity TEXT NOT NULL,
        confidence REAL NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        suggested_candidate_kind TEXT,
        replayable_hint INTEGER,
        requires_manual_validation_hint INTEGER,
        created_at TEXT NOT NULL,
        PRIMARY KEY (diagnosis_run_id, finding_id)
      )`,
      `CREATE TABLE IF NOT EXISTS backtest_runs (
        backtest_run_id TEXT PRIMARY KEY,
        diagnosis_run_id TEXT,
        diagnosis_finding_id TEXT,
        job_id TEXT NOT NULL,
        candidate_kind TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS maya_evaluations (
        maya_run_id TEXT PRIMARY KEY,
        backtest_run_id TEXT NOT NULL,
        diagnosis_run_id TEXT,
        diagnosis_finding_id TEXT,
        lens_id TEXT,
        lens_name TEXT,
        fixed INTEGER NOT NULL,
        verdict TEXT NOT NULL,
        confidence REAL,
        judged_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS diagnosis_findings_lens_idx ON diagnosis_findings (lens_id)`,
      `CREATE INDEX IF NOT EXISTS maya_evaluations_lens_idx ON maya_evaluations (lens_id)`,
      `CREATE INDEX IF NOT EXISTS maya_evaluations_judged_idx ON maya_evaluations (judged_at)`,
    ], 'write');
  }
}

function bool(value: boolean): number {
  return value ? 1 : 0;
}

function nullableBool(value: boolean | null): number | null {
  return value === null ? null : bool(value);
}

function numberOf(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}
