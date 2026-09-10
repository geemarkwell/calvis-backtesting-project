import { BadRequestException, ConflictException } from '@nestjs/common';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestSpecsSchema } from './test-specs.schema';
import { TestSpecsService } from './test-specs.service';

const createDto = {
  id: 'guard-profile-update-quality',
  version: 'draft',
  name: 'Guard profile update quality',
  userQuestion: 'Is the Copilot updating guard profiles properly?',
  agentSurface: 'guard_profile_update',
  criteria: [
    {
      id: 'preserve-durable-facts',
      importance: 'critical' as const,
      description: 'Preserve durable facts.',
      passRule: 'No durable fact disappears without evidence.',
    },
    {
      id: 'capture-new-signal',
      importance: 'major' as const,
      description: 'Capture meaningful new signal.',
      passRule: 'Important repeated behavior is reflected.',
    },
    {
      id: 'avoid-hallucinations',
      importance: 'critical' as const,
      description: 'Avoid unsupported claims.',
      passRule: 'Every new claim has evidence.',
    },
  ],
  requiredEvidence: ['previous_guard_profile', 'latest_shift_trace'],
  passCondition: 'All critical criteria pass.',
  assumptions: [],
  limitations: [],
};

describe('TestSpecsService', () => {
  let root: string;
  let service: TestSpecsService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'test-specs-'));
    service = new TestSpecsService(new TestSpecsSchema(root));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates and reads a saved test spec', async () => {
    const created = await service.create(createDto);

    expect(created.id).toBe(createDto.id);
    expect(created.version).toBe('1');
    expect(created.createdAt).toBeTruthy();
    await expect(service.findById({ id: createDto.id })).resolves.toEqual(created);
    await expect(service.findAll()).resolves.toEqual([created]);
  });

  it('allocates a slug from the name when id is omitted', async () => {
    const created = await service.create({ ...createDto, id: undefined });

    expect(created.id).toBe('guard-profile-update-quality');
  });

  it('does not overwrite an explicit existing id', async () => {
    await service.create(createDto);

    await expect(service.create(createDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('increments version and preserves createdAt on update', async () => {
    const created = await service.create(createDto);
    const updated = await service.update(
      { id: created.id },
      { ...createDto, name: 'Updated guard profile test' },
    );

    expect(updated.version).toBe('2');
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt).toBeTruthy();
    expect(updated.name).toBe('Updated guard profile test');
  });

  it('rejects duplicate criterion ids', async () => {
    await expect(
      service.create({
        ...createDto,
        criteria: [
          createDto.criteria[0],
          { ...createDto.criteria[1], id: createDto.criteria[0].id },
          createDto.criteria[2],
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
