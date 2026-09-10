import { Agent } from '@mastra/core/agent';
import { TEST_CRITERIA_INSTRUCTIONS } from '../../test-criteria/instructions';

export const testCriteriaAgent = new Agent({
  id: 'test-criteria',
  name: 'Test Criteria Drafter',
  description:
    'Drafts structured, user-confirmable agent evaluation criteria from plain-language questions.',
  instructions: TEST_CRITERIA_INSTRUCTIONS,
  model: process.env.TEST_CRITERIA_MODEL ?? 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: {
    maxSteps: 1,
    toolChoice: 'none',
  },
  editor: false,
});
