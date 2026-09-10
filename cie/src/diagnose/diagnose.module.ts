import { Module } from '@nestjs/common';
import { DiagnoseArtifactsSchema } from './diagnose-artifacts.schema';
import { DiagnoseController } from './diagnose.controller';
import { DiagnoseService } from './diagnose.service';

@Module({
  controllers: [DiagnoseController],
  providers: [DiagnoseService, DiagnoseArtifactsSchema],
})
export class DiagnoseModule {}
