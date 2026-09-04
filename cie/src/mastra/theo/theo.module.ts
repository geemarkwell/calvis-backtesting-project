import { Module } from '@nestjs/common';
import { TheoController } from './theo.controller';
import { TheoService } from './theo.service';
import { CandidateDecisionService } from './candidate-decision.service';

@Module({
  controllers: [TheoController],
  providers: [TheoService, CandidateDecisionService],
  exports: [TheoService, CandidateDecisionService],
})
export class TheoModule {}
