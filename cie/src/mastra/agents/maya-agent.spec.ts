jest.mock('@mastra/core/agent', () => ({
  Agent: jest.fn((configuration: unknown) => configuration),
}));

import { Agent } from '@mastra/core/agent';
import { MAYA_INSTRUCTIONS } from '../maya/instructions';
import { mayaAgent } from './maya-agent';

describe('Maya agent', () => {
  it('uses a configurable judge model without tools, memory, or editor', () => {
    expect(Agent).toHaveBeenCalledWith({
      id: 'maya',
      name: 'Maya',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      description: expect.any(String),
      instructions: MAYA_INSTRUCTIONS,
      model: process.env.MAYA_MODEL ?? 'openai/gpt-5.6-sol',
      maxRetries: 0,
      defaultOptions: {
        maxSteps: 1,
        toolChoice: 'none',
      },
      editor: false,
    });
    expect(mayaAgent).not.toHaveProperty('tools');
    expect(mayaAgent).not.toHaveProperty('memory');
  });
});
