import type { DiagnoseResponseDto } from '../../diagnose/dto/diagnose-response.dto';
import type { BacktestCopilotDto } from '../../copilot-simulation/dto/backtest-copilot.dto';
import type { CopilotBacktestResponse } from '../../copilot-simulation/copilot-backtest.service';

export interface RecordDiagnosisRunDto {
  diagnosis: DiagnoseResponseDto;
}

export interface RecordBacktestRunDto {
  input: BacktestCopilotDto;
  response: CopilotBacktestResponse;
}
