import { Agent } from '@mastra/core/agent';
import { TEST_EVALUATOR_INSTRUCTIONS } from '../../test-evaluations/instructions';

export const testEvaluatorAgent = new Agent({
  id: 'test-evaluator',
  name: 'Test Evaluator',
  description:
    'Evaluates Calvis agent traces against confirmed user-defined test criteria.',
  instructions: TEST_EVALUATOR_INSTRUCTIONS,
  model: process.env.TEST_EVALUATOR_MODEL ?? 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: {
    maxSteps: 1,
    toolChoice: 'none',
  },
  editor: false,
});
