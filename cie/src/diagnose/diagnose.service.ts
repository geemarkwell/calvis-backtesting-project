import { Injectable } from '@nestjs/common';
import type { DiagnoseRequestDto } from './dto/diagnose-request.dto';
import type { DiagnoseResponseDto } from './dto/diagnose-response.dto';
import { runDiagnose } from './runner';

@Injectable()
export class DiagnoseService {
  async discover(dto: DiagnoseRequestDto): Promise<DiagnoseResponseDto> {
    return runDiagnose({ request: dto });
  }
}
