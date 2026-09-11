import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsSchema } from './analytics.schema';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsSchema],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
