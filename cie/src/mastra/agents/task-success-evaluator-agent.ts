import { Agent } from '@mastra/core/agent';
import { TASK_SUCCESS_EVALUATOR_INSTRUCTIONS } from '../../diagnose/evaluator-instructions';

export const taskSuccessEvaluatorAgent = new Agent({
  id: 'task-success-evaluator',
  name: 'Task Success Evaluator',
  description:
    'Evaluates task completion, final correctness, client conditions, and false success claims in bounded copilot traces.',
  instructions: TASK_SUCCESS_EVALUATOR_INSTRUCTIONS,
  model: process.env.TASK_SUCCESS_EVALUATOR_MODEL ?? process.env.DIAGNOSE_MODEL ?? 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: { maxSteps: 1, toolChoice: 'none' },
  editor: false,
});
