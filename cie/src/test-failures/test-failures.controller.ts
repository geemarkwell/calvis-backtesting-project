import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { createTestFailureSchema } from './dto/test-failure.dto';
import { TestFailuresService } from './test-failures.service';

@ApiTags('test-failures')
@Controller('test-failures')
export class TestFailuresController {
  constructor(private readonly testFailuresService: TestFailuresService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'evaluationRunId',
        'testSpecId',
        'jobId',
        'startTurn',
        'endTurn',
        'verdict',
        'summary',
        'suggestedFix',
        'failedCriteria',
        'artifactDirectory',
      ],
      properties: {
        evaluationRunId: { type: 'string', example: 'eval-20260910-abcd1234' },
        testSpecId: { type: 'string', example: 'guard-politeness' },
        jobId: { type: 'string', example: '56370' },
        startTurn: { type: 'number', example: 9 },
        endTurn: { type: 'number', example: 16 },
        verdict: { type: 'string', enum: ['bad'] },
        summary: { type: 'string' },
        suggestedFix: {
          type: 'object',
          required: ['category', 'summary'],
          properties: {
            category: { type: 'string' },
            summary: { type: 'string' },
          },
        },
        failedCriteria: { type: 'array', items: { type: 'object' } },
        artifactDirectory: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ description: 'Saved failed evaluation and suggested fix.' })
  create(@Body() input: unknown) {
    const dto = createTestFailureSchema.safeParse(input);
    if (!dto.success) {
      throw new BadRequestException({
        message: 'Invalid failed evaluation save request.',
        issues: dto.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return this.testFailuresService.create(dto.data);
  }

  @Get()
  @ApiOkResponse({ description: 'List saved failed evaluations.' })
  findAll() {
    return this.testFailuresService.findAll();
  }
}
