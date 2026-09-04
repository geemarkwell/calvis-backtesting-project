import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  MayaJudgmentService,
  type MayaJudgmentQuery,
} from './maya-judgment.service';

@Controller('maya')
export class MayaController {
  constructor(private readonly mayaJudgmentService: MayaJudgmentService) {}

  @Get('judgments')
  getJudgments(@Query() input: MayaJudgmentQuery) {
    return this.mayaJudgmentService.getHistory(input);
  }

  @Post('judge')
  judge(@Body() input: unknown) {
    return this.mayaJudgmentService.judge(input);
  }
}
