import { Module } from '@nestjs/common';
import { TestFailuresController } from './test-failures.controller';
import { TestFailuresSchema } from './test-failures.schema';
import { TestFailuresService } from './test-failures.service';

@Module({
  controllers: [TestFailuresController],
  providers: [TestFailuresService, TestFailuresSchema],
  exports: [TestFailuresService],
})
export class TestFailuresModule {}
