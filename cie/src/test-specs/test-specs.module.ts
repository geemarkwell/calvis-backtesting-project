import { Module } from '@nestjs/common';
import { TestSpecsController } from './test-specs.controller';
import { TestSpecsSchema } from './test-specs.schema';
import { TestSpecsService } from './test-specs.service';

@Module({
  controllers: [TestSpecsController],
  providers: [TestSpecsService, TestSpecsSchema],
  exports: [TestSpecsService],
})
export class TestSpecsModule {}
