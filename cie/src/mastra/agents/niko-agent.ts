import { Agent } from '@mastra/core/agent';
import { NIKO_INSTRUCTIONS } from '../niko/instructions';

export const nikoAgent = new Agent({
  id: 'niko',
  name: 'Niko',
  description:
    'Produces one coherent guard reply after a candidate Copilot replay diverges from recorded history.',
  instructions: NIKO_INSTRUCTIONS,
  model: 'openai/gpt-5-mini',
  maxRetries: 0,
  defaultOptions: {
    maxSteps: 1,
    toolChoice: 'none',
  },
  editor: false,
});
