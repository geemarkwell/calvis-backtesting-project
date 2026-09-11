import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { lensPerformanceQuerySchema } from './dto/lens-performance.dto';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('lens-performance')
  @ApiOkResponse({ description: 'Lens-level Diagnose and Maya outcome analytics.' })
  lensPerformance(@Query() input: unknown) {
    const parsed = lensPerformanceQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid analytics query.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return this.analyticsService.lensPerformance(parsed.data);
  }
}
