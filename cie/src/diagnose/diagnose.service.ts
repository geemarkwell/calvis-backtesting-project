import { Injectable } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { DiagnoseArtifactsSchema } from './diagnose-artifacts.schema';
import type { DiagnoseRequestDto } from './dto/diagnose-request.dto';
import type { DiagnoseRunIdParamDto, DiagnoseRunsResponseDto } from './dto/diagnose-run.dto';
import type { DiagnoseResponseDto } from './dto/diagnose-response.dto';
import { runDiagnose } from './runner';

@Injectable()
export class DiagnoseService {
  constructor(
    private readonly artifacts: DiagnoseArtifactsSchema,
    private readonly analytics: AnalyticsService,
  ) {}

  async discover(dto: DiagnoseRequestDto): Promise<DiagnoseResponseDto> {
    const diagnosis = await runDiagnose({ request: dto });
    await this.analytics.recordDiagnosisRun({ diagnosis });
    return diagnosis;
  }

  async findAllRuns(): Promise<DiagnoseRunsResponseDto> {
    return this.artifacts.findAll();
  }

  async findRunById(dto: DiagnoseRunIdParamDto): Promise<DiagnoseResponseDto> {
    return this.artifacts.findById(dto.runId);
  }
}
