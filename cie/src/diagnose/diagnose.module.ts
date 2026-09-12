import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { DiagnoseArtifactsSchema } from './diagnose-artifacts.schema';
import { DiagnoseController } from './diagnose.controller';
import { DiagnoseService } from './diagnose.service';

@Module({
  imports: [AnalyticsModule],
  controllers: [DiagnoseController],
  providers: [DiagnoseService, DiagnoseArtifactsSchema],
  exports: [DiagnoseService],
})
export class DiagnoseModule {}
