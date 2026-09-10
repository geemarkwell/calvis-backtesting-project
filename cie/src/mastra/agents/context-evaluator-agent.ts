import { Agent } from '@mastra/core/agent';
import { CONTEXT_EVALUATOR_INSTRUCTIONS } from '../../diagnose/evaluator-instructions';

export const contextEvaluatorAgent = new Agent({
  id: 'context-evaluator',
  name: 'Context Evaluator',
  description:
    'Evaluates missing context, context overload, retrieval failures, unsupported claims, and compaction loss in bounded copilot traces.',
  instructions: CONTEXT_EVALUATOR_INSTRUCTIONS,
  model: process.env.CONTEXT_EVALUATOR_MODEL ?? process.env.DIAGNOSE_MODEL ?? 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: { maxSteps: 1, toolChoice: 'none' },
  editor: false,
});
