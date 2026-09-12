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
import { TestCriteriaModule } from './test-criteria/test-criteria.module';
import { TestSpecsModule } from './test-specs/test-specs.module';
import { TestEvaluationsModule } from './test-evaluations/test-evaluations.module';
import { TestFailuresModule } from './test-failures/test-failures.module';
import { DiagnoseModule } from './diagnose/diagnose.module';
import { DiagnosisQueueModule } from './diagnosis-queue/diagnosis-queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CopilotSimulationModule,
    TheoModule,
    MayaModule,
    TestCriteriaModule,
    TestSpecsModule,
    TestEvaluationsModule,
    TestFailuresModule,
    DiagnoseModule,
    DiagnosisQueueModule,
    MastraModule.register({ mastra }),
    AgentModule,
    MemoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
