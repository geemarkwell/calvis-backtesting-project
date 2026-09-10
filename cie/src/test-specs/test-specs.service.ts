import { BadRequestException, Injectable } from '@nestjs/common';
import {
  savedTestSpecSchema,
  type CreateTestSpecDto,
  type SavedTestSpecDto,
  type TestSpecIdParamDto,
  type UpdateTestSpecDto,
} from './dto/test-spec.dto';
import { TestSpecsSchema } from './test-specs.schema';

@Injectable()
export class TestSpecsService {
  constructor(private readonly schema: TestSpecsSchema) {}

  async create(dto: CreateTestSpecDto): Promise<SavedTestSpecDto> {
    const now = new Date().toISOString();
    const id = dto.id ?? (await this.nextAvailableId(slugify(dto.name)));
    return this.schema.create(
      this.validateSavedSpec({
        ...dto,
        id,
        version: '1',
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  findAll(): Promise<SavedTestSpecDto[]> {
    return this.schema.findAll();
  }

  findById(dto: TestSpecIdParamDto): Promise<SavedTestSpecDto> {
    return this.schema.findById(dto);
  }

  async update(
    params: TestSpecIdParamDto,
    dto: UpdateTestSpecDto,
  ): Promise<SavedTestSpecDto> {
    const current = await this.schema.findById(params);
    const now = new Date().toISOString();
    const nextVersion = String(Number(current.version) + 1);
    return this.schema.update(
      this.validateSavedSpec({
        ...dto,
        id: current.id,
        version: nextVersion,
        createdAt: current.createdAt,
        updatedAt: now,
      }),
    );
  }

  private async nextAvailableId(baseId: string): Promise<string> {
    let id = baseId;
    let suffix = 2;
    while (await this.schema.exists({ id })) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    return id;
  }

  private validateSavedSpec(value: unknown): SavedTestSpecDto {
    const parsed = savedTestSpecSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid test spec.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return parsed.data;
  }
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'test-spec';
}
