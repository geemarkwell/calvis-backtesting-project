import { Module } from '@nestjs/common';
import { TestCriteriaController } from './test-criteria.controller';
import { TestCriteriaService } from './test-criteria.service';

@Module({
  controllers: [TestCriteriaController],
  providers: [TestCriteriaService],
  exports: [TestCriteriaService],
})
export class TestCriteriaModule {}
