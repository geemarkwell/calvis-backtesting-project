import { BadRequestException } from '@nestjs/common';
import { TestSpecsController } from './test-specs.controller';
import { TestSpecsService } from './test-specs.service';

const createDto = {
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

const saved = {
  ...createDto,
  id: 'guard-profile-update-quality',
  version: '1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('TestSpecsController', () => {
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<TestSpecsService>;
  const controller = new TestSpecsController(service);

  beforeEach(() => {
    service.create.mockReset();
    service.findAll.mockReset();
    service.findById.mockReset();
    service.update.mockReset();
  });

  it('validates and delegates create requests', async () => {
    service.create.mockResolvedValue(saved);

    await expect(controller.create(createDto)).resolves.toEqual(saved);
    expect(service.create).toHaveBeenCalledWith(createDto);
  });

  it('validates and delegates get by id requests', async () => {
    service.findById.mockResolvedValue(saved);

    await expect(
      controller.findById({ id: 'guard-profile-update-quality' }),
    ).resolves.toEqual(saved);
    expect(service.findById).toHaveBeenCalledWith({
      id: 'guard-profile-update-quality',
    });
  });

  it('validates and delegates update requests', async () => {
    service.update.mockResolvedValue({ ...saved, version: '2' });

    await expect(
      controller.update({ id: saved.id }, createDto),
    ).resolves.toMatchObject({ version: '2' });
    expect(service.update).toHaveBeenCalledWith({ id: saved.id }, createDto);
  });

  it('rejects malformed create requests before calling the service', () => {
    expect(() => controller.create({ ...createDto, criteria: [] })).toThrow(
      BadRequestException,
    );
    expect(service.create).not.toHaveBeenCalled();
  });

  it('rejects invalid ids before calling the service', () => {
    expect(() => controller.findById({ id: '../bad' })).toThrow(
      BadRequestException,
    );
    expect(service.findById).not.toHaveBeenCalled();
  });
});
