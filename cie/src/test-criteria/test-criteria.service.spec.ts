jest.mock('./runner', () => ({
  runDraftTestCriteria: jest.fn(),
}));

import { runDraftTestCriteria } from './runner';
import { TestCriteriaService } from './test-criteria.service';

const mockedRunDraftTestCriteria = jest.mocked(runDraftTestCriteria);

const request = {
  userQuestion: 'Is the Copilot updating guard profiles properly after each shift?',
};

const response = {
  runId: 'criteria-test',
  artifactDirectory: '/tmp/criteria-test',
  testSpec: {
    id: 'guard-profile-update-quality',
    version: 'draft' as const,
    name: 'Guard profile update quality',
    userQuestion: request.userQuestion,
    agentSurface: 'guard_profile_update',
    criteria: [
      {
        id: 'preserve-durable-facts',
        importance: 'critical' as const,
        description: 'Preserve durable guard facts from the previous profile.',
        passRule: 'No durable fact is removed without supporting evidence.',
      },
      {
        id: 'capture-new-signal',
        importance: 'major' as const,
        description: 'Capture meaningful new behavior from the latest shift.',
        passRule: 'Important repeated behavior is reflected concisely.',
      },
      {
        id: 'avoid-hallucinations',
        importance: 'critical' as const,
        description: 'Do not add unsupported guard claims.',
        passRule: 'Every new claim has evidence.',
      },
    ],
    requiredEvidence: ['previous_guard_profile', 'latest_shift_trace'],
    passCondition: 'All critical criteria pass.',
    assumptions: [],
    limitations: [],
  },
};

describe('TestCriteriaService', () => {
  const service = new TestCriteriaService();

  beforeEach(() => {
    mockedRunDraftTestCriteria.mockReset();
  });

  it('drafts criteria through the runner', async () => {
    mockedRunDraftTestCriteria.mockResolvedValue(response);

    await expect(service.draft(request)).resolves.toEqual(response);
    expect(mockedRunDraftTestCriteria).toHaveBeenCalledWith({ request });
  });
});
