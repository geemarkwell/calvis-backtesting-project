import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { TheoService } from './theo.service';
import {
  CandidateDecisionService,
  type CandidateCoordinates,
} from './candidate-decision.service';

@Controller('theo')
export class TheoController {
  constructor(
    private readonly theoService: TheoService,
    private readonly candidateDecisionService: CandidateDecisionService,
  ) {}

  @Post('diagnose')
  @HttpCode(HttpStatus.OK)
  diagnose(@Body() input: unknown) {
    return this.theoService.diagnose(input);
  }

  @Post('candidates/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Body() input: CandidateCoordinates) {
    return this.candidateDecisionService.accept(input);
  }

  @Post('candidates/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Body() input: CandidateCoordinates) {
    return this.candidateDecisionService.reject(input);
  }
}
