import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DiagnoseService } from './diagnose.service';
import { diagnoseRequestSchema } from './dto/diagnose-request.dto';

@ApiTags('diagnose')
@Controller('diagnose')
export class DiagnoseController {
  constructor(private readonly diagnoseService: DiagnoseService) {}

  @Post('discover')
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['jobId', 'startTurn', 'endTurn'],
      additionalProperties: false,
      properties: {
        jobId: { type: 'string', example: '56370' },
        startTurn: { type: 'number', example: 9 },
        endTurn: { type: 'number', example: 16 },
      },
    },
  })
  @ApiOkResponse({
    description: 'Ranked failure patterns discovered in the selected trace window.',
    schema: {
      type: 'object',
      required: [
        'runId',
        'artifactDirectory',
        'jobId',
        'startTurn',
        'endTurn',
        'summary',
        'patterns',
        'llmFindings',
        'noFindings',
      ],
      properties: {
        runId: { type: 'string' },
        artifactDirectory: { type: 'string' },
        jobId: { type: 'string' },
        startTurn: { type: 'number' },
        endTurn: { type: 'number' },
        summary: { type: 'string' },
        noFindings: { type: 'boolean' },
        patterns: {
          type: 'array',
          description: 'Deterministic pre-analyzer signals.',
          items: { type: 'object' },
        },
        llmFindings: {
          type: 'array',
          description: 'LLM-authored diagnostic findings grounded in the trace window.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              category: { type: 'string' },
              severity: { type: 'string' },
              confidence: { type: 'number' },
              diagnosis: { type: 'string' },
              likelyCause: { type: 'string' },
              suggestedFix: { type: 'string' },
              evidence: { type: 'array', items: { type: 'object' } },
            },
          },
        },
      },
    },
  })
  discover(@Body() input: unknown) {
    const request = diagnoseRequestSchema.safeParse(input);
    if (!request.success) {
      throw new BadRequestException({
        message: 'Invalid diagnose request.',
        issues: request.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return this.diagnoseService.discover(request.data);
  }
}
