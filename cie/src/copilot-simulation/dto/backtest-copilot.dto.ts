import { SimulateCopilotDto } from './simulate-copilot.dto';

export class BacktestCopilotDto extends SimulateCopilotDto {
  callout!: string;
  expectedBehavior!: string;
  baselineSource?: 'shift' | 'simulation';
  baselineSimulationNumber?: number;
}
