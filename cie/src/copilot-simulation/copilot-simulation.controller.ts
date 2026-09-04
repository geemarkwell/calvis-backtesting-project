import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { CopilotOriginalService } from './copilot-original.service';
import { CopilotBacktestService } from './copilot-backtest.service';
import { CopilotSimulationService } from './copilot-simulation.service';
import { GetOriginalCopilotDto } from './dto/get-original-copilot.dto';
import { BacktestCopilotDto } from './dto/backtest-copilot.dto';
import { SimulateCopilotDto } from './dto/simulate-copilot.dto';

@Controller('copilot')
export class CopilotSimulationController {
  constructor(
    private readonly copilotSimulationService: CopilotSimulationService,
    private readonly copilotOriginalService: CopilotOriginalService,
    private readonly copilotBacktestService: CopilotBacktestService,
  ) {}

  @Get('original')
  getOriginal(@Query() input: GetOriginalCopilotDto) {
    return this.copilotOriginalService.getOriginal(input);
  }

  @Get('original-sources')
  getOriginalSources(@Query() input: GetOriginalCopilotDto) {
    return this.copilotOriginalService.listSources(input);
  }

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  simulate(@Body() input: SimulateCopilotDto) {
    return this.copilotSimulationService.simulate(input);
  }

  @Post('backtest')
  @HttpCode(HttpStatus.OK)
  backtest(@Body() input: BacktestCopilotDto) {
    return this.copilotBacktestService.run(input);
  }
}
