import { BadRequestException, Injectable } from '@nestjs/common';
import {
  savedTestFailureSchema,
  type CreateTestFailureDto,
  type SavedTestFailureDto,
} from './dto/test-failure.dto';
import { TestFailuresSchema } from './test-failures.schema';

@Injectable()
export class TestFailuresService {
  constructor(private readonly schema: TestFailuresSchema) {}

  create(dto: CreateTestFailureDto): Promise<SavedTestFailureDto> {
    return this.schema.create(
      this.validate({
        ...dto,
        id: `failure-${dto.evaluationRunId}`,
        jobId: String(dto.jobId),
        savedAt: new Date().toISOString(),
      }),
    );
  }

  findAll(): Promise<SavedTestFailureDto[]> {
    return this.schema.findAll();
  }

  private validate(value: unknown): SavedTestFailureDto {
    const parsed = savedTestFailureSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid failed evaluation record.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return parsed.data;
  }
}
