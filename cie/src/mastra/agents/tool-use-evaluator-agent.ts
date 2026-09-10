import { Agent } from '@mastra/core/agent';
import { TOOL_USE_EVALUATOR_INSTRUCTIONS } from '../../diagnose/evaluator-instructions';

export const toolUseEvaluatorAgent = new Agent({
  id: 'tool-use-evaluator',
  name: 'Tool Use Evaluator',
  description:
    'Evaluates tool selection, arguments, failures, repeated calls, result interpretation, and recovery in bounded copilot traces.',
  instructions: TOOL_USE_EVALUATOR_INSTRUCTIONS,
  model: process.env.TOOL_USE_EVALUATOR_MODEL ?? process.env.DIAGNOSE_MODEL ?? 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: { maxSteps: 1, toolChoice: 'none' },
  editor: false,
});
