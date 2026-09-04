import { Injectable } from '@nestjs/common';
import { MastraService } from '@mastra/nestjs';

@Injectable()
export class AgentService {
  constructor(private readonly mastraService: MastraService) {}

  async chat(agentId: string, message: string) {
    const agent = this.mastraService.getAgent(agentId);
    return agent.generate([{ role: 'user', content: message }]);
  }

  async runWorkflow(workflowId: string, input: Record<string, unknown>) {
    const workflow = this.mastraService.getWorkflow(workflowId);
    const run = await workflow.createRun();
    return run.start({ inputData: input });
  }
}
