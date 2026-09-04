export class GetOriginalCopilotDto {
  jobId!: string | number;
  startTurn?: string | number;
  endTurn?: string | number;
  source?: 'shift' | 'simulation';
  simulationNumber?: string | number;
}
