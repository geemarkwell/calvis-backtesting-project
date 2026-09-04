import { Agent } from '@mastra/core/agent';
import { MAYA_INSTRUCTIONS } from '../maya/instructions';

export const mayaAgent = new Agent({
  id: 'maya',
  name: 'Maya',
  description:
    'Judges whether a candidate Calvis Copilot replay fixed the behavior in one original callout.',
  instructions: MAYA_INSTRUCTIONS,
  model: process.env.MAYA_MODEL ?? 'openai/gpt-5.6-sol',
  maxRetries: 0,
  defaultOptions: {
    maxSteps: 1,
    toolChoice: 'none',
  },
  editor: false,
});
