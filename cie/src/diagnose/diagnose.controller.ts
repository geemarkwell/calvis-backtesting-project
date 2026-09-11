import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DiagnoseService } from './diagnose.service';
import { diagnoseRequestSchema } from './dto/diagnose-request.dto';
import { diagnoseRunIdParamSchema } from './dto/diagnose-run.dto';

@ApiTags('diagnose')
@Controller('diagnose')
export class DiagnoseController {
  constructor(private readonly diagnoseService: DiagnoseService) {}

  @Get('runs')
  @ApiOkResponse({ description: 'List saved diagnosis runs.' })
  findAllRuns() {
    return this.diagnoseService.findAllRuns();
  }

  @Get('runs/:runId')
  @ApiOkResponse({ description: 'Saved diagnosis run.' })
  findRunById(@Param() input: unknown) {
    const params = diagnoseRunIdParamSchema.safeParse(input);
    if (!params.success) {
      throw new BadRequestException({
        message: 'Invalid diagnosis run ID.',
        issues: params.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return this.diagnoseService.findRunById(params.data);
  }

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
        replaySource: {
          type: 'string',
          enum: ['production'],
          description: 'Optional legacy field. CIE now uses production replay data only.',
        },
        lensIds: {
          type: 'array',
          description: 'Optional built-in Diagnose policy lenses. Defaults to all policy lenses when omitted.',
          items: {
            type: 'string',
            enum: [
              'policy-role-authority',
              'policy-uniform-attire',
              'policy-time-scheduling',
              'policy-checkin-checkout',
              'policy-patrol-expectations',
              'policy-escalation-rules',
            ],
          },
          example: ['policy-role-authority', 'policy-escalation-rules'],
        },
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
        'lenses',
        'patterns',
        'llmFindings',
        'evaluatorReports',
        'toolCalls',
        'toolSummary',
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
        lenses: {
          type: 'array',
          description: 'Built-in Diagnose lenses selected for this run.',
          items: { type: 'object' },
        },
        patterns: {
          type: 'array',
          description: 'Deterministic pre-analyzer signals.',
          items: { type: 'object' },
        },
        llmFindings: {
          type: 'array',
          description: 'All LLM-authored diagnostic findings flattened across specialized evaluators.',
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
        evaluatorReports: {
          type: 'array',
          description: 'Findings grouped by specialized evaluator.',
          items: { type: 'object' },
        },
        toolCalls: {
          type: 'array',
          description: 'Tool calls observed in the selected trace window.',
          items: { type: 'object' },
        },
        toolSummary: {
          type: 'array',
          description: 'Tool call counts grouped by tool name.',
          items: { type: 'object' },
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
