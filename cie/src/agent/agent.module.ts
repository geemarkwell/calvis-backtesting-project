import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { MastraModule } from '@mastra/nestjs';
import { mastra } from '../mastra';

@Module({
  imports: [MastraModule.register({ mastra })],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
