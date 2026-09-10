import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  createTestSpecSchema,
  testSpecIdParamSchema,
  updateTestSpecSchema,
} from './dto/test-spec.dto';
import { TestSpecsService } from './test-specs.service';

const criterionSwagger = {
  type: 'object',
  required: ['id', 'importance', 'description', 'passRule'],
  properties: {
    id: { type: 'string', example: 'avoid-hallucinations' },
    importance: { type: 'string', enum: ['critical', 'major', 'minor'] },
    description: { type: 'string' },
    passRule: { type: 'string' },
    evidenceNeeded: { type: 'array', items: { type: 'string' } },
  },
};

const createSpecSwagger = {
  type: 'object',
  required: [
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
    description: { type: 'string' },
    userQuestion: { type: 'string' },
    agentSurface: { type: 'string', example: 'guard_profile_update' },
    criteria: { type: 'array', items: criterionSwagger },
    requiredEvidence: { type: 'array', items: { type: 'string' } },
    passCondition: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
};

@ApiTags('test-specs')
@Controller('test-specs')
export class TestSpecsController {
  constructor(private readonly testSpecsService: TestSpecsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ schema: createSpecSwagger })
  @ApiOkResponse({ description: 'Saved reusable test spec.' })
  create(@Body() input: unknown) {
    const dto = parseDto(createTestSpecSchema, input, 'Invalid create test spec request.');
    return this.testSpecsService.create(dto);
  }

  @Get()
  @ApiOkResponse({ description: 'List saved reusable test specs.' })
  findAll() {
    return this.testSpecsService.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Saved reusable test spec.' })
  findById(@Param() input: unknown) {
    const params = parseDto(testSpecIdParamSchema, input, 'Invalid test spec ID.');
    return this.testSpecsService.findById(params);
  }

  @Put(':id')
  @ApiBody({ schema: createSpecSwagger })
  @ApiOkResponse({ description: 'Updated reusable test spec.' })
  update(@Param() paramsInput: unknown, @Body() bodyInput: unknown) {
    const params = parseDto(testSpecIdParamSchema, paramsInput, 'Invalid test spec ID.');
    const dto = parseDto(updateTestSpecSchema, bodyInput, 'Invalid update test spec request.');
    return this.testSpecsService.update(params, dto);
  }
}

function parseDto<T>(
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } },
  input: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException({
      message,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}
