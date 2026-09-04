import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { MastraModule } from '@mastra/nestjs';
import { mastra } from './mastra';
import { AgentModule } from './agent/agent.module';
import { MemoryModule } from './memory/memory.module';
import { CopilotSimulationModule } from './copilot-simulation/copilot-simulation.module';
import { TheoModule } from './mastra/theo/theo.module';
import { MayaModule } from './mastra/maya/maya.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CopilotSimulationModule,
    TheoModule,
    MayaModule,
    MastraModule.register({ mastra }),
    AgentModule,
    MemoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
