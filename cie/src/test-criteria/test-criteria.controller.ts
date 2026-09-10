import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { draftTestCriteriaRequestSchema } from './dto/draft-test-criteria.dto';
import { TestCriteriaService } from './test-criteria.service';

@ApiTags('test-criteria')
@Controller('test-criteria')
export class TestCriteriaController {
  constructor(private readonly testCriteriaService: TestCriteriaService) {}

  @Post('draft')
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userQuestion'],
      additionalProperties: false,
      properties: {
        userQuestion: {
          type: 'string',
          description:
            'Plain-language question describing what the user wants to test.',
          example:
            'Is the Copilot updating guard profiles properly after each shift?',
        },
        availableEvidence: {
          type: 'array',
          description:
            'Optional known evidence/artifact names the future test can inspect.',
          items: { type: 'string' },
          example: [
            'previous_guard_profile',
            'latest_shift_trace',
            'profile_update_tool_call_or_write',
            'resulting_guard_profile',
          ],
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Draft test criteria generated from the user question.',
    schema: {
      type: 'object',
      required: ['runId', 'artifactDirectory', 'testSpec'],
      properties: {
        runId: { type: 'string' },
        artifactDirectory: { type: 'string' },
        testSpec: {
          type: 'object',
          required: [
            'id',
            'version',
            'name',
            'userQuestion',
            'agentSurface',
            'criteria',
            'requiredEvidence',
            'passCondition',
            'assumptions',
            'limitations',
          ],
          properties: {
            id: { type: 'string', example: 'guard-profile-update-quality' },
            version: { type: 'string', example: 'draft' },
            name: { type: 'string', example: 'Guard profile update quality' },
            userQuestion: { type: 'string' },
            agentSurface: { type: 'string', example: 'guard_profile_update' },
            criteria: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'importance', 'description', 'passRule'],
                properties: {
                  id: { type: 'string' },
                  importance: {
                    type: 'string',
                    enum: ['critical', 'major', 'minor'],
                  },
                  description: { type: 'string' },
                  passRule: { type: 'string' },
                  evidenceNeeded: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
            requiredEvidence: { type: 'array', items: { type: 'string' } },
            passCondition: { type: 'string' },
            assumptions: { type: 'array', items: { type: 'string' } },
            limitations: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  draft(@Body() input: unknown) {
    const request = draftTestCriteriaRequestSchema.safeParse(input);
    if (!request.success) {
      throw new BadRequestException({
        message: 'Invalid test criteria draft request.',
        issues: request.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }

    return this.testCriteriaService.draft(request.data);
  }
}
