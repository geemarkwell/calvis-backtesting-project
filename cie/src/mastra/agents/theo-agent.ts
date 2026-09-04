import { Agent } from '@mastra/core/agent';
import { THEO_INSTRUCTIONS } from '../theo/instructions';

export const theoAgent = new Agent({
  id: 'theo',
  name: 'Theo',
  description:
    'Diagnoses prompt-rooted failures in historical Calvis Copilot traces and proposes one minimal prompt edit.',
  instructions: THEO_INSTRUCTIONS,
  model: 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: {
    maxSteps: 1,
    toolChoice: 'none',
  },
  editor: false,
});
