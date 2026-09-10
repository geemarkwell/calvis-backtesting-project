import { Injectable } from '@nestjs/common';
import { CopilotOriginalService } from '../copilot-simulation/copilot-original.service';
import { TestSpecsService } from '../test-specs/test-specs.service';
import type { EvaluateTestRequestDto } from './dto/evaluate-test.dto';
import type { EvaluateTestResponseDto } from './dto/evaluate-test-response.dto';
import { runTestEvaluation } from './runner';

@Injectable()
export class TestEvaluationsService {
  constructor(
    private readonly testSpecsService: TestSpecsService,
    private readonly copilotOriginalService: CopilotOriginalService,
  ) {}

  async evaluate(dto: EvaluateTestRequestDto): Promise<EvaluateTestResponseDto> {
    const testSpec = await this.testSpecsService.findById({
      id: dto.testSpecId,
    });
    const replay = await this.copilotOriginalService.getOriginal({
      jobId: dto.jobId,
      startTurn: dto.startTurn,
      endTurn: dto.endTurn,
      source: dto.source,
      simulationNumber: dto.simulationNumber,
    });
    const result = await runTestEvaluation({ testSpec, replay });

    return {
      runId: result.runId,
      artifactDirectory: result.artifactDirectory,
      testSpecId: testSpec.id,
      jobId: replay.jobId,
      startTurn: replay.startTurn,
      endTurn: replay.endTurn,
      verdict: result.verdict,
    };
  }
}
