import { Agent } from '@mastra/core/agent';
import { PROMPT_ISSUE_EVALUATOR_INSTRUCTIONS } from '../../diagnose/evaluator-instructions';

export const promptIssueEvaluatorAgent = new Agent({
  id: 'prompt-issue-evaluator',
  name: 'Prompt Issue Evaluator',
  description:
    'Evaluates whether bounded copilot trace failures are likely caused by missing, ambiguous, conflicting, or poorly prioritized prompt instructions.',
  instructions: PROMPT_ISSUE_EVALUATOR_INSTRUCTIONS,
  model: process.env.PROMPT_ISSUE_EVALUATOR_MODEL ?? process.env.DIAGNOSE_MODEL ?? 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: { maxSteps: 1, toolChoice: 'none' },
  editor: false,
});
