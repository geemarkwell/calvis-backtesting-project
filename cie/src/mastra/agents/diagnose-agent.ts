import { Agent } from '@mastra/core/agent';
import { DIAGNOSE_INSTRUCTIONS } from '../../diagnose/instructions';

export const diagnoseAgent = new Agent({
  id: 'diagnose',
  name: 'Diagnose',
  description:
    'Discovers important failure patterns from bounded Calvis copilot production traces.',
  instructions: DIAGNOSE_INSTRUCTIONS,
  model: process.env.DIAGNOSE_MODEL ?? 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: {
    maxSteps: 1,
    toolChoice: 'none',
  },
  editor: false,
});
