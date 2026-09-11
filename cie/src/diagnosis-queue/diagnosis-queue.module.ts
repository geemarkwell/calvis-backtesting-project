import { Module } from '@nestjs/common';
import { DiagnoseModule } from '../diagnose/diagnose.module';
import { DiagnosisQueueController } from './diagnosis-queue.controller';
import { DiagnosisQueueSchema } from './diagnosis-queue.schema';
import { DiagnosisQueueService } from './diagnosis-queue.service';

@Module({
  imports: [DiagnoseModule],
  controllers: [DiagnosisQueueController],
  providers: [DiagnosisQueueSchema, DiagnosisQueueService],
  exports: [DiagnosisQueueService],
})
export class DiagnosisQueueModule {}
