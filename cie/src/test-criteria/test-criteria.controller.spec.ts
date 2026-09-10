jest.mock('./runner', () => ({
  runDraftTestCriteria: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { TestCriteriaController } from './test-criteria.controller';
import { TestCriteriaService } from './test-criteria.service';

const response = {
  runId: 'criteria-test',
  artifactDirectory: '/tmp/criteria-test',
  testSpec: {
    id: 'guard-profile-update-quality',
    version: 'draft' as const,
    name: 'Guard profile update quality',
    userQuestion: 'Is the Copilot updating guard profiles properly?',
    agentSurface: 'guard_profile_update',
    criteria: [
      {
        id: 'preserve-durable-facts',
        importance: 'critical' as const,
        description: 'Preserve durable facts.',
        passRule: 'Durable facts remain unless contradicted.',
      },
      {
        id: 'capture-new-signal',
        importance: 'major' as const,
        description: 'Capture new signal.',
        passRule: 'New repeated behavior appears in the profile.',
      },
      {
        id: 'avoid-hallucinations',
        importance: 'critical' as const,
        description: 'Avoid unsupported claims.',
        passRule: 'Claims cite available evidence.',
      },
    ],
    requiredEvidence: ['previous_guard_profile', 'latest_shift_trace'],
    passCondition: 'All critical criteria pass.',
    assumptions: [],
    limitations: [],
  },
};

describe('TestCriteriaController', () => {
  const service = {
    draft: jest.fn(),
  } as unknown as jest.Mocked<TestCriteriaService>;
  const controller = new TestCriteriaController(service);

  beforeEach(() => {
    service.draft.mockReset();
  });

  it('validates and delegates draft requests', async () => {
    service.draft.mockResolvedValue(response);

    await expect(
      controller.draft({
        userQuestion: response.testSpec.userQuestion,
      }),
    ).resolves.toEqual(response);
    expect(service.draft).toHaveBeenCalledWith({
      userQuestion: response.testSpec.userQuestion,
    });
  });

  it('rejects invalid draft requests before calling the service', () => {
    expect(() => controller.draft({ userQuestion: '' })).toThrow(
      BadRequestException,
    );
    expect(service.draft).not.toHaveBeenCalled();
  });

  it('rejects extra fields other than optional availableEvidence', () => {
    expect(() =>
      controller.draft({
        userQuestion: response.testSpec.userQuestion,
        policyHints: ['Do not accept this field yet.'],
      }),
    ).toThrow(BadRequestException);
    expect(service.draft).not.toHaveBeenCalled();
  });
});
