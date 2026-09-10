import { Module } from '@nestjs/common';
import { CopilotSimulationModule } from '../copilot-simulation/copilot-simulation.module';
import { TestSpecsModule } from '../test-specs/test-specs.module';
import { TestEvaluationsController } from './test-evaluations.controller';
import { TestEvaluationsService } from './test-evaluations.service';

@Module({
  imports: [TestSpecsModule, CopilotSimulationModule],
  controllers: [TestEvaluationsController],
  providers: [TestEvaluationsService],
})
export class TestEvaluationsModule {}
