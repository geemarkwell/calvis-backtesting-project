import { Injectable } from '@nestjs/common';
import { DiagnoseService } from '../diagnose/diagnose.service';
import { DiagnosisQueueSchema } from './diagnosis-queue.schema';
import type {
  ClearDiagnosisQueueDto,
  ClearDiagnosisQueueResponseDto,
  DiagnosisQueueIdParamDto,
  DiagnosisQueueResponseDto,
  DiagnosisQueueStatusDto,
  EnqueueDiagnosisJobDto,
  EnqueueDiagnosisJobResponseDto,
  FinishDiagnosisQueueJobDto,
  ListDiagnosisQueueDto,
  SweepStartDiagnosisQueueDto,
  SweepStartDiagnosisQueueResponseDto,
} from './dto/diagnosis-queue.dto';

@Injectable()
export class DiagnosisQueueService {
  private readonly cancelledJobIds = new Set<string>();

  constructor(
    private readonly schema: DiagnosisQueueSchema,
    private readonly diagnoseService: DiagnoseService,
  ) {}

  async enqueue(dto: EnqueueDiagnosisJobDto): Promise<EnqueueDiagnosisJobResponseDto> {
    return this.schema.enqueue(dto);
  }

  async list(dto: ListDiagnosisQueueDto): Promise<DiagnosisQueueResponseDto> {
    const items = await this.schema.list(dto);
    return { items, count: items.length };
  }

  async listStatus(status: DiagnosisQueueStatusDto): Promise<DiagnosisQueueResponseDto> {
    const items = await this.schema.listStatus(status);
    return { items, count: items.length };
  }

  async start(dto: DiagnosisQueueIdParamDto): Promise<{ item: DiagnosisQueueResponseDto['items'][number] }> {
    const item = await this.schema.markRunning(dto);
    void this.runStartedDiagnosis(item.jobId);
    return { item };
  }

  async complete(dto: FinishDiagnosisQueueJobDto): Promise<{ item: DiagnosisQueueResponseDto['items'][number] }> {
    return { item: await this.schema.markCompleted(dto) };
  }

  async fail(dto: FinishDiagnosisQueueJobDto): Promise<{ item: DiagnosisQueueResponseDto['items'][number] }> {
    return { item: await this.schema.markFailed(dto) };
  }

  async cancel(dto: DiagnosisQueueIdParamDto): Promise<{ item: DiagnosisQueueResponseDto['items'][number] }> {
    const item = await this.schema.cancel(dto);
    this.cancelledJobIds.add(item.jobId);
    await this.startNextQueuedDiagnosis();
    return { item };
  }

  async deleteOne(dto: DiagnosisQueueIdParamDto): Promise<ClearDiagnosisQueueResponseDto> {
    return { deleted: await this.schema.deleteOne(dto) };
  }

  async clear(dto: ClearDiagnosisQueueDto): Promise<ClearDiagnosisQueueResponseDto> {
    return { deleted: await this.schema.clear(dto) };
  }

  async sweepStart(dto: SweepStartDiagnosisQueueDto): Promise<SweepStartDiagnosisQueueResponseDto> {
    const discoveredJobIds = await this.fetchRecentDiagnosisCandidates(dto);
    const enqueued: SweepStartDiagnosisQueueResponseDto['enqueued'] = [];
    const skippedJobIds: string[] = [];

    for (const jobId of discoveredJobIds) {
      const result = await this.schema.enqueueIfUnregistered({
        jobId,
        reason: 'scheduled_sweep_start',
        requestedBy: 'cie/diagnosis-queue',
        replaySource: 'production',
        scope: 'full-job',
      });
      if (result.created && result.item) {
        enqueued.push(result.item);
      } else {
        skippedJobIds.push(jobId);
      }
    }

    const started = await this.schema.startOldestQueued();
    if (!started) {
      return {
        scanned: discoveredJobIds.length,
        enqueued,
        skippedJobIds,
        started: null,
        completed: null,
        diagnosisRunId: null,
        errorMessage: null,
      };
    }

    void this.runStartedDiagnosis(started.jobId);
    return {
      scanned: discoveredJobIds.length,
      enqueued,
      skippedJobIds,
      started,
      completed: null,
      diagnosisRunId: null,
      errorMessage: null,
    };
  }

  private async runStartedDiagnosis(jobId: string): Promise<void> {
    try {
      const diagnosis = await this.diagnoseService.discover({
        jobId,
        scope: 'full-job',
        replaySource: 'production',
        useCompactContext: true,
      });
      if (this.cancelledJobIds.has(jobId)) {
        this.cancelledJobIds.delete(jobId);
        return;
      }
      await this.schema.markCompleted({ jobId, diagnosisRunId: diagnosis.runId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.schema.markFailed({ jobId, errorMessage });
    } finally {
      await this.startNextQueuedDiagnosis();
    }
  }

  private async startNextQueuedDiagnosis(): Promise<void> {
    const next = await this.schema.startOldestQueued();
    if (!next) return;
    await this.runStartedDiagnosis(next.jobId);
  }

  private async fetchRecentDiagnosisCandidates(dto: SweepStartDiagnosisQueueDto): Promise<string[]> {
    const baseUrl = productionApiBaseUrl();
    const token = process.env.CALVIS_API_TOKEN?.trim();
    if (!token) {
      return [];
    }
    const url = new URL(`${baseUrl}/api/v2/copilot/insights/review-pending/`);
    url.searchParams.set('lookback_hours', String(dto.lookbackHours));
    url.searchParams.set('limit', String(dto.limit));

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return [];
    }
    const pending = isRecord(payload) && isRecord(payload.success) && Array.isArray(payload.success.pending)
      ? payload.success.pending
      : [];
    return pending
      .map((item) => isRecord(item) ? item.job_id : null)
      .map((jobId) => typeof jobId === 'number' || typeof jobId === 'string' ? String(jobId).trim() : '')
      .filter((jobId) => /^\d+$/.test(jobId));
  }
}

function productionApiBaseUrl(): string {
  const configured =
    process.env.CALVIS_API_URL?.trim() ||
    process.env.VITE_CALVIS_API_URL?.trim() ||
    'http://localhost:8000';
  return configured.replace(/\/api\/?$/, '').replace(/\/api\/v2\/?$/, '').replace(/\/$/, '');
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
