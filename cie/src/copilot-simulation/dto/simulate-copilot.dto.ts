export class SimulateCopilotDto {
  jobId!: string | number;
  startTurn?: number;
  endTurn?: number;
  replayMode?: 'original' | 'candidate';
  promptVersion?: string;
  callNiko?: boolean;
  debug?: boolean;
}
