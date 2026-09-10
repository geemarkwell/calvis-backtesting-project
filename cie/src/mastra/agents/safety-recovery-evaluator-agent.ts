import { Agent } from '@mastra/core/agent';
import { SAFETY_RECOVERY_EVALUATOR_INSTRUCTIONS } from '../../diagnose/evaluator-instructions';

export const safetyRecoveryEvaluatorAgent = new Agent({
  id: 'safety-recovery-evaluator',
  name: 'Safety and Recovery Evaluator',
  description:
    'Evaluates permission violations, approval requirements, unsafe behavior, ambiguity handling, and recovery from errors in bounded copilot traces.',
  instructions: SAFETY_RECOVERY_EVALUATOR_INSTRUCTIONS,
  model: process.env.SAFETY_RECOVERY_EVALUATOR_MODEL ?? process.env.DIAGNOSE_MODEL ?? 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: { maxSteps: 1, toolChoice: 'none' },
  editor: false,
});
