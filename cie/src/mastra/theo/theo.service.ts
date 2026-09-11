import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { BacktestDebuggingSink } from '../../backtestDebugging/logger';
import { redactModelProviderError } from '../../common/errors/model-provider-error';
import { TheoDiagnosisValidationError } from './diagnosis-validator';
import { theoRequestSchema } from './diagnostic-input';
import { runTheo } from './runner';

@Injectable()
export class TheoService {
  async diagnose(input: unknown, backtestDebugging?: BacktestDebuggingSink) {
    const request = theoRequestSchema.safeParse(input);

    if (!request.success) {
      throw new BadRequestException({
        message: 'Invalid Theo request.',
        issues: request.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    await backtestDebugging?.writeStage(
      '03a-theo-validated-request.json',
      request.data,
    );

    let result: Awaited<ReturnType<typeof runTheo>>;
    try {
      result = await runTheo({ request: request.data, backtestDebugging });
    } catch (error) {
      if (isModelProviderError(error)) {
        const redacted = redactModelProviderError(error);
        await backtestDebugging?.writeStage('03d-theo-model-error.json', {
          phase: 'theo',
          ...redacted,
        });
        throw new InternalServerErrorException({
          message: 'Theo model call failed.',
          code: 'THEO_MODEL_CALL_FAILED',
          phase: 'theo',
          retryable: redacted.retryable,
          provider: redacted.provider,
          statusCode: redacted.statusCode,
          requestId: redacted.requestId,
          detail: redacted.detail ?? redacted.message,
          causeCode: redacted.causeCode,
        });
      }
      if (error instanceof TheoDiagnosisValidationError) {
        await backtestDebugging?.writeStage('03g-theo-validation-failed.json', {
          phase: 'theo',
          issues: error.issues,
        });
        throw new BadRequestException({
          message: 'Theo returned an invalid diagnosis after repair.',
          code: 'THEO_DIAGNOSIS_VALIDATION_FAILED',
          phase: 'theo',
          retryable: true,
          issues: error.issues,
        });
      }
      throw error;
    }

    return {
      ...result,
      suggestedPromptChange: result.diagnosis.proposed_edit ?? null,
    };
  }
}

function isModelProviderError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      ('isRetryable' in error || 'requestBodyValues' in error || 'responseBody' in error),
  );
}
