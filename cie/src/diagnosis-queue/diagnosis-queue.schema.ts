import { Injectable } from '@nestjs/common';
import { createClient, type Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type {
  DiagnosisQueueIdParamDto,
  DiagnosisQueueItemDto,
  DiagnosisQueueStatusDto,
  EnqueueDiagnosisJobDto,
  ClearDiagnosisQueueDto,
  FinishDiagnosisQueueJobDto,
  ListDiagnosisQueueDto,
} from './dto/diagnosis-queue.dto';

@Injectable()
export class DiagnosisQueueSchema {
  private readonly db: Client;
  private initialized?: Promise<void>;

  constructor() {
    this.db = createClient({ url: `file:${resolve(process.cwd(), 'cie-analytics.db')}` });
  }

  async enqueue(dto: EnqueueDiagnosisJobDto): Promise<{ item: DiagnosisQueueItemDto; created: boolean }> {
    await this.ensureInitialized();
    const existing = await this.findActiveByJob(dto.jobId);
    if (existing) {
      return { item: existing, created: false };
    }
    return { item: await this.insertQueued(dto), created: true };
  }

  async enqueueIfUnregistered(dto: EnqueueDiagnosisJobDto): Promise<{ item: DiagnosisQueueItemDto | null; created: boolean }> {
    await this.ensureInitialized();
    const existing = await this.findLatestByJob(dto.jobId);
    if (existing) {
      return { item: existing, created: false };
    }
    return { item: await this.insertQueued(dto), created: true };
  }

  private async insertQueued(dto: EnqueueDiagnosisJobDto): Promise<DiagnosisQueueItemDto> {
    const id = `diagq-${randomUUID().slice(0, 12)}`;
    const queuedAt = new Date().toISOString();
    await this.db.execute({
      sql: `INSERT INTO diagnosis_queue
        (id, job_id, status, reason, requested_by, replay_source, scope,
         source_session_id, diagnosis_run_id, error_message, queued_at, started_at, completed_at)
        VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL)`,
      args: [
        id,
        dto.jobId,
        dto.reason,
        dto.requestedBy,
        dto.replaySource,
        dto.scope,
        dto.sourceSessionId ?? null,
        queuedAt,
      ],
    });
    const item = await this.findById(id);
    if (!item) {
      throw new Error('Queued diagnosis job could not be read back.');
    }
    return item;
  }

  async list(dto: ListDiagnosisQueueDto): Promise<DiagnosisQueueItemDto[]> {
    await this.ensureInitialized();
    const result = dto.status
      ? await this.db.execute({
          sql: `SELECT * FROM diagnosis_queue
            WHERE status = ?
            ORDER BY ${statusOrderColumn(dto.status)} DESC, queued_at DESC
            LIMIT ?`,
          args: [dto.status, dto.limit],
        })
      : await this.db.execute({
          sql: `SELECT * FROM diagnosis_queue
            ORDER BY
              CASE status
                WHEN 'running' THEN 0
                WHEN 'completed' THEN 1
                WHEN 'failed' THEN 2
                WHEN 'queued' THEN 3
                ELSE 4
              END ASC,
              CASE
                WHEN status = 'completed' THEN COALESCE(completed_at, queued_at)
                WHEN status = 'running' THEN COALESCE(started_at, queued_at)
                WHEN status = 'failed' THEN COALESCE(completed_at, queued_at)
                ELSE queued_at
              END DESC,
              queued_at DESC
            LIMIT ?`,
          args: [dto.limit],
        });
    return result.rows.map(rowToItem);
  }

  async listStatus(status: DiagnosisQueueStatusDto, limit = 50): Promise<DiagnosisQueueItemDto[]> {
    return this.list({ status, limit });
  }

  async markRunning(dto: DiagnosisQueueIdParamDto): Promise<DiagnosisQueueItemDto> {
    await this.ensureInitialized();
    const startedAt = new Date().toISOString();
    await this.db.execute({
      sql: `UPDATE diagnosis_queue
        SET status = 'running', started_at = COALESCE(started_at, ?), error_message = NULL
        WHERE id = ? AND status IN ('queued', 'running')`,
      args: [startedAt, dto.id],
    });
    const item = await this.findById(dto.id);
    if (!item) throw new Error(`Diagnosis queue item ${dto.id} not found.`);
    return item;
  }

  async startOldestQueued(): Promise<DiagnosisQueueItemDto | null> {
    await this.ensureInitialized();
    const result = await this.db.execute({
      sql: `SELECT * FROM diagnosis_queue
        WHERE status = 'queued'
        ORDER BY queued_at ASC
        LIMIT 1`,
      args: [],
    });
    const row = result.rows[0];
    if (!row) return null;
    return this.markRunning({ id: String(row.id) });
  }

  async markCompleted(dto: FinishDiagnosisQueueJobDto): Promise<DiagnosisQueueItemDto> {
    return this.finishByJob(dto, 'completed');
  }

  async markFailed(dto: FinishDiagnosisQueueJobDto): Promise<DiagnosisQueueItemDto> {
    return this.finishByJob(dto, 'failed');
  }

  async cancel(dto: DiagnosisQueueIdParamDto): Promise<DiagnosisQueueItemDto> {
    await this.ensureInitialized();
    const item = await this.findById(dto.id);
    if (!item) throw new Error(`Diagnosis queue item ${dto.id} not found.`);
    const completedAt = new Date().toISOString();
    await this.db.execute({
      sql: `UPDATE diagnosis_queue
        SET status = 'failed', error_message = 'Cancelled by user.', completed_at = ?
        WHERE id = ? AND status IN ('queued', 'running')`,
      args: [completedAt, dto.id],
    });
    const updated = await this.findById(dto.id);
    if (!updated) throw new Error(`Diagnosis queue item ${dto.id} not found.`);
    return updated;
  }

  async deleteOne(dto: DiagnosisQueueIdParamDto): Promise<number> {
    await this.ensureInitialized();
    const result = await this.db.execute({
      sql: `DELETE FROM diagnosis_queue WHERE id = ?`,
      args: [dto.id],
    });
    return result.rowsAffected;
  }

  async clear(dto: ClearDiagnosisQueueDto): Promise<number> {
    await this.ensureInitialized();
    const where = dto.status ? 'WHERE status = ?' : `WHERE status != 'running'`;
    const args = dto.status ? [dto.status] : [];
    const result = await this.db.execute({
      sql: `DELETE FROM diagnosis_queue ${where}`,
      args,
    });
    return result.rowsAffected;
  }

  private async finishByJob(
    dto: FinishDiagnosisQueueJobDto,
    status: 'completed' | 'failed',
  ): Promise<DiagnosisQueueItemDto> {
    await this.ensureInitialized();
    const active = await this.findActiveByJob(dto.jobId);
    if (!active) throw new Error(`No active diagnosis queue item for job ${dto.jobId}.`);
    const completedAt = new Date().toISOString();
    await this.db.execute({
      sql: `UPDATE diagnosis_queue
        SET status = ?, diagnosis_run_id = COALESCE(?, diagnosis_run_id),
            error_message = ?, completed_at = ?
        WHERE id = ?`,
      args: [
        status,
        dto.diagnosisRunId ?? null,
        status === 'failed' ? dto.errorMessage ?? 'Diagnosis failed.' : null,
        completedAt,
        active.id,
      ],
    });
    const item = await this.findById(active.id);
    if (!item) throw new Error(`Diagnosis queue item ${active.id} not found.`);
    return item;
  }

  private async findActiveByJob(jobId: string): Promise<DiagnosisQueueItemDto | null> {
    const result = await this.db.execute({
      sql: `SELECT * FROM diagnosis_queue
        WHERE job_id = ? AND status IN ('queued', 'running')
        ORDER BY queued_at DESC
        LIMIT 1`,
      args: [jobId],
    });
    return result.rows[0] ? rowToItem(result.rows[0]) : null;
  }

  private async findLatestByJob(jobId: string): Promise<DiagnosisQueueItemDto | null> {
    const result = await this.db.execute({
      sql: `SELECT * FROM diagnosis_queue
        WHERE job_id = ?
        ORDER BY queued_at DESC
        LIMIT 1`,
      args: [jobId],
    });
    return result.rows[0] ? rowToItem(result.rows[0]) : null;
  }

  private async findById(id: string): Promise<DiagnosisQueueItemDto | null> {
    const result = await this.db.execute({
      sql: `SELECT * FROM diagnosis_queue WHERE id = ? LIMIT 1`,
      args: [id],
    });
    return result.rows[0] ? rowToItem(result.rows[0]) : null;
  }

  private ensureInitialized(): Promise<void> {
    this.initialized ??= this.initialize();
    return this.initialized;
  }

  private async initialize(): Promise<void> {
    await this.db.batch([
      `CREATE TABLE IF NOT EXISTS diagnosis_queue (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed')),
        reason TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        replay_source TEXT NOT NULL,
        scope TEXT NOT NULL,
        source_session_id TEXT,
        diagnosis_run_id TEXT,
        error_message TEXT,
        queued_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS diagnosis_queue_status_idx ON diagnosis_queue (status, queued_at)`,
      `CREATE INDEX IF NOT EXISTS diagnosis_queue_job_idx ON diagnosis_queue (job_id, queued_at)`,
    ], 'write');
  }
}

function statusOrderColumn(status: DiagnosisQueueStatusDto): string {
  if (status === 'completed' || status === 'failed') return 'COALESCE(completed_at, queued_at)';
  if (status === 'running') return 'COALESCE(started_at, queued_at)';
  return 'queued_at';
}

function rowToItem(row: Record<string, unknown>): DiagnosisQueueItemDto {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    status: String(row.status) as DiagnosisQueueItemDto['status'],
    reason: String(row.reason),
    requestedBy: String(row.requested_by),
    replaySource: 'production',
    scope: 'full-job',
    sourceSessionId: nullableString(row.source_session_id),
    diagnosisRunId: nullableString(row.diagnosis_run_id),
    errorMessage: nullableString(row.error_message),
    queuedAt: String(row.queued_at),
    startedAt: nullableString(row.started_at),
    completedAt: nullableString(row.completed_at),
  };
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}
