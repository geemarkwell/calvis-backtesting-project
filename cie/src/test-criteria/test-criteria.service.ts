import { BadRequestException, Injectable } from '@nestjs/common';
import type { DraftTestCriteriaRequestDto } from './dto/draft-test-criteria.dto';
import type { DraftTestCriteriaResponseDto } from './dto/draft-test-criteria-response.dto';
import { runDraftTestCriteria } from './runner';

@Injectable()
export class TestCriteriaService {
  async draft(
    dto: DraftTestCriteriaRequestDto,
  ): Promise<DraftTestCriteriaResponseDto> {
    try {
      return await runDraftTestCriteria({ request: dto });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw error;
    }
  }
}
