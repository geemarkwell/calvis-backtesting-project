import { BadRequestException, Injectable } from '@nestjs/common';
import type { ShiftBundle } from './copilot-simulation.types';

export type ReplaySource = 'production';

export interface LoadedShiftBundle {
  jobId: string;
  bundle: ShiftBundle;
}

export interface ShiftBundleSource {
  load(jobId: string | number): Promise<LoadedShiftBundle>;
}

@Injectable()
export class ShiftBundleSourceResolver {
  async load(
    jobId: string | number,
    source: unknown,
  ): Promise<LoadedShiftBundle> {
    normalizeReplaySource(source);
    return new ProductionShiftBundleSource().load(jobId);
  }
}

export class ProductionShiftBundleSource implements ShiftBundleSource {
  async load(jobId: string | number): Promise<LoadedShiftBundle> {
    const normalizedJobId = normalizeJobId(jobId);
    const baseUrl = productionApiBaseUrl();
    const token = process.env.CALVIS_API_TOKEN?.trim();
    if (!token) {
      throw new BadRequestException(
        'CALVIS_API_TOKEN is required for replaySource "production".',
      );
    }

    const url = new URL(`${baseUrl}/api/v2/copilot/replay-bundle/`);
    url.searchParams.set('job_id', normalizedJobId);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      });
    } catch (error) {
      throw new BadRequestException(
        `Production replay bundle API unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw new BadRequestException(
        apiErrorMessage(payload) ??
          `Production replay bundle API failed with HTTP ${response.status}.`,
      );
    }

    const success = isRecord(payload) ? payload.success : undefined;
    if (!isRecord(success)) {
      throw new BadRequestException(
        'Production replay bundle API returned an invalid response.',
      );
    }
    const bundle = success.bundle;
    const responseJobId = success.jobId;
    if (!isShiftBundle(bundle)) {
      throw new BadRequestException(
        'Production replay bundle does not match expected ShiftBundle shape.',
      );
    }
    return {
      jobId: typeof responseJobId === 'string' ? responseJobId : normalizedJobId,
      bundle,
    };
  }
}

export function normalizeReplaySource(value: unknown): ReplaySource {
  if (value === undefined || value === null || value === '' || value === 'production') {
    return 'production';
  }
  if (value === 'file') {
    throw new BadRequestException('Local file replay is no longer supported. CIE now uses production replay data only.');
  }
  throw new BadRequestException('replaySource must be production when provided.');
}

function productionApiBaseUrl(): string {
  const configured =
    process.env.CALVIS_API_URL?.trim() ||
    process.env.VITE_CALVIS_API_URL?.trim() ||
    'http://localhost:8000';
  return configured.replace(/\/api\/?$/, '').replace(/\/api\/v2\/?$/, '').replace(/\/$/, '');
}

function normalizeJobId(value: unknown): string {
  const normalized =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number' && Number.isSafeInteger(value)
        ? String(value)
        : '';
  if (!/^\d+$/.test(normalized)) {
    throw new BadRequestException('jobId must contain digits only.');
  }
  return normalized;
}

function apiErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const error = value.error;
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  if (typeof value.message === 'string') {
    return value.message;
  }
  return null;
}

function isShiftBundle(value: unknown): value is ShiftBundle {
  if (!isRecord(value)) {
    return false;
  }
  const shift = value.shift;
  return (
    isRecord(shift) &&
    shift.id !== undefined &&
    typeof shift.start === 'string' &&
    typeof shift.end === 'string' &&
    typeof shift.timezone === 'string' &&
    Array.isArray(value.events) &&
    Array.isArray(value.baseline)
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
