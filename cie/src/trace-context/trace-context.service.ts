import { Injectable } from '@nestjs/common';
import type { NormalizedTraceEntry } from '../mastra/theo/trace-normalizer';
import { compileTraceContext } from './trace-context.compiler';
import type {
  CompactTraceContextDto,
  CompileTraceContextInputDto,
} from './dto/compile-trace-context.dto';

@Injectable()
export class TraceContextService {
  compile(
    dto: CompileTraceContextInputDto & { trace: readonly NormalizedTraceEntry[] },
  ): CompactTraceContextDto {
    return compileTraceContext(dto);
  }
}
