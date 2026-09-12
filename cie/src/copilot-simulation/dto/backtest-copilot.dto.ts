import { SimulateCopilotDto } from './simulate-copilot.dto';

export type BacktestCandidateKind =
  | 'prompt'
  | 'tool'
  | 'context'
  | 'workflow'
  | 'safety'
  | 'code'
  | 'test'
  | 'unknown';

export interface BacktestTurnWindowDto {
  startTurn: number;
  endTurn: number;
  source?: 'full-job' | 'evidence' | 'fallback';
}

export interface BacktestDiagnosisContextDto {
  diagnosisRunId?: string;
  patternId: string;
  diagnosis: string;
  likelyCause: string;
  suggestedFix: string;
  suggestedCandidateKind?: BacktestCandidateKind;
  candidateKindRationale?: string;
  replayableHint?: boolean;
  requiresManualValidationHint?: boolean;
  diagnosisWindow?: BacktestTurnWindowDto;
  replayWindow?: BacktestTurnWindowDto;
}

export class BacktestCopilotDto extends SimulateCopilotDto {
  callout!: string;
  expectedBehavior!: string;
  baselineSource?: 'shift' | 'simulation';
  baselineSimulationNumber?: number;
  diagnosisContext?: BacktestDiagnosisContextDto;
}
