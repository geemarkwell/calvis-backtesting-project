import { Module } from '@nestjs/common';
import { MayaJudgmentService } from './maya-judgment.service';
import { MayaController } from './maya.controller';

@Module({
  controllers: [MayaController],
  providers: [MayaJudgmentService],
  exports: [MayaJudgmentService],
})
export class MayaModule {}
