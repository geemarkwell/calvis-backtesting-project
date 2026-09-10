import { Agent } from '@mastra/core/agent';
import { FREE_AGENT_EVALUATOR_INSTRUCTIONS } from '../../diagnose/evaluator-instructions';

export const freeAgentEvaluatorAgent = new Agent({
  id: 'free-agent-evaluator',
  name: 'Free Agent Evaluator',
  description:
    'Evaluates uncovered loopholes, vulnerabilities, cross-lens failures, silent failure modes, and other risks in bounded copilot traces.',
  instructions: FREE_AGENT_EVALUATOR_INSTRUCTIONS,
  model: process.env.FREE_AGENT_EVALUATOR_MODEL ?? process.env.DIAGNOSE_MODEL ?? 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: { maxSteps: 1, toolChoice: 'none' },
  editor: false,
});
