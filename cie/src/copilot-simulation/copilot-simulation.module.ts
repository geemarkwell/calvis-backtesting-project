import { Module } from '@nestjs/common';
import { CopilotSimulationController } from './copilot-simulation.controller';
import { CopilotOriginalService } from './copilot-original.service';
import { CopilotSimulationService } from './copilot-simulation.service';
import { CopilotBacktestService } from './copilot-backtest.service';
import { MayaModule } from '../mastra/maya/maya.module';
import { TheoModule } from '../mastra/theo/theo.module';

@Module({
  imports: [MayaModule, TheoModule],
  controllers: [CopilotSimulationController],
  providers: [
    CopilotOriginalService,
    CopilotSimulationService,
    CopilotBacktestService,
  ],
})
export class CopilotSimulationModule {}
