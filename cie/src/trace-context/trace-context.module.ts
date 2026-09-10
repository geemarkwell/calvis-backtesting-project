import { Module } from '@nestjs/common';
import { TraceContextSchema } from './trace-context.schema';
import { TraceContextService } from './trace-context.service';

@Module({
  providers: [TraceContextSchema, TraceContextService],
  exports: [TraceContextService],
})
export class TraceContextModule {}
