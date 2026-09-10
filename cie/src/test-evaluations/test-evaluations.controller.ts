import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { evaluateTestRequestSchema } from './dto/evaluate-test.dto';
import { TestEvaluationsService } from './test-evaluations.service';

@ApiTags('test-evaluations')
@Controller('test-evaluations')
export class TestEvaluationsController {
  constructor(private readonly testEvaluationsService: TestEvaluationsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['testSpecId', 'jobId'],
      additionalProperties: false,
      properties: {
        testSpecId: {
          type: 'string',
          example: 'guard-profile-update-quality',
        },
        jobId: { type: 'string', example: '56370' },
        startTurn: { type: 'number', example: 9 },
        endTurn: { type: 'number', example: 16 },
        source: { type: 'string', enum: ['shift', 'simulation'] },
        simulationNumber: { type: 'number', example: 3 },
      },
    },
  })
  @ApiOkResponse({
    description: 'Good/Bad evaluation of a trace against a saved test spec.',
  })
  evaluate(@Body() input: unknown) {
    const dto = evaluateTestRequestSchema.safeParse(input);
    if (!dto.success) {
      throw new BadRequestException({
        message: 'Invalid test evaluation request.',
        issues: dto.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return this.testEvaluationsService.evaluate(dto.data);
  }
}
