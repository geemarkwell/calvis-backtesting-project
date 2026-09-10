import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export type PipelineBreadcrumbLevel = 'START' | 'SUCCESS' | 'ERROR' | 'WARN' | 'SKIP' | 'INFO';

export interface PipelineBreadcrumb {
  runId: string;
  timestamp: string;
  elapsedMs: number;
  stage: string;
  event: string;
  ok: boolean | null;
  data: Record<string, unknown>;
}

const COLORS: Record<string, string> = {
  BACKTEST: '\u001B[36m',
  THEO: '\u001B[35m',
  ORIGINAL: '\u001B[34m',
  CANDIDATE: '\u001B[33m',
  MAYA: '\u001B[32m',
  DIAGNOSE: '\u001B[93m',
  ERROR: '\u001B[31m',
  SUCCESS: '\u001B[32m',
  WARN: '\u001B[33m',
  SKIP: '\u001B[33m',
  INFO: '\u001B[90m',
};
const RESET = '\u001B[0m';
const SENSITIVE_KEY = /api[_-]?key|token|secret|password|authorization|cookie/i;

export class PipelineLogger {
  readonly runId: string;
  readonly artifactDirectory: string;
  private readonly startedAt = Date.now();
  private readonly filePath: string;

  constructor({
    runId = defaultPipelineRunId(),
    runsRoot = resolve(process.cwd(), 'runs'),
  }: {
    runId?: string;
    runsRoot?: string;
  } = {}) {
    this.runId = runId;
    this.artifactDirectory = resolve(runsRoot, runId);
    mkdirSync(this.artifactDirectory, { recursive: true });
    this.filePath = resolve(this.artifactDirectory, 'breadcrumbs.jsonl');
  }

  stage(stage: string): PipelineStageLogger {
    return new PipelineStageLogger(this, stage);
  }

  breadcrumb(stage: string, event: PipelineBreadcrumbLevel | string, data: Record<string, unknown> = {}): void {
    const normalizedStage = stage.toUpperCase();
    const normalizedEvent = event.toUpperCase();
    const ok = normalizedEvent === 'SUCCESS'
      ? true
      : normalizedEvent === 'ERROR'
        ? false
        : null;
    const breadcrumb: PipelineBreadcrumb = {
      runId: this.runId,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - this.startedAt,
      stage: normalizedStage,
      event: normalizedEvent,
      ok,
      data: sanitizeRecord(data),
    };
    appendFileSync(this.filePath, `${JSON.stringify(breadcrumb)}\n`, 'utf8');
    // eslint-disable-next-line no-console
    console.log(formatTerminalBreadcrumb(breadcrumb));
  }
}

export class PipelineStageLogger {
  constructor(
    private readonly logger: PipelineLogger,
    private readonly stageName: string,
  ) {}

  start(data?: Record<string, unknown>): void {
    this.logger.breadcrumb(this.stageName, 'START', data);
  }

  success(data?: Record<string, unknown>): void {
    this.logger.breadcrumb(this.stageName, 'SUCCESS', data);
  }

  error(error: unknown, data: Record<string, unknown> = {}): void {
    this.logger.breadcrumb(this.stageName, 'ERROR', {
      ...data,
      error: summarizeError(error),
    });
  }

  warn(data?: Record<string, unknown>): void {
    this.logger.breadcrumb(this.stageName, 'WARN', data);
  }

  skip(data?: Record<string, unknown>): void {
    this.logger.breadcrumb(this.stageName, 'SKIP', data);
  }

  info(event: string, data?: Record<string, unknown>): void {
    this.logger.breadcrumb(this.stageName, event, data);
  }
}

function defaultPipelineRunId(): string {
  const timestamp = new Date().toISOString().replaceAll(/[-:.TZ]/g, '');
  return `backtest-${timestamp}-${randomUUID().slice(0, 8)}`;
}

function formatTerminalBreadcrumb(breadcrumb: PipelineBreadcrumb): string {
  const stageColor = COLORS[breadcrumb.stage] ?? COLORS.INFO;
  const eventColor = COLORS[breadcrumb.event] ?? '';
  const elapsed = `${breadcrumb.elapsedMs.toString().padStart(6, '0')}ms`;
  const stage = `${stageColor}[${breadcrumb.stage.padEnd(9)}]${RESET}`;
  const event = `${eventColor}${breadcrumb.event}${RESET}`;
  const details = formatDetails(breadcrumb.data);
  return `${stage} ${elapsed} ${event}${details ? ` ${details}` : ''}`;
}

function formatDetails(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(' ');
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value.includes(' ') ? JSON.stringify(value) : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function sanitizeRecord(data: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(data) as Record<string, unknown>;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeValue);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizeValue(item);
  }
  return output;
}

function summarizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(isRecord(error) && typeof error.stack === 'string'
        ? { stackTop: error.stack.split('\n').slice(0, 3).join('\n') }
        : {}),
    };
  }
  return { message: String(error) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
