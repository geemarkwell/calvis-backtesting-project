import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { DiagnosisQueueService } from './diagnosis-queue.service';
import {
  clearDiagnosisQueueSchema,
  diagnosisQueueIdParamSchema,
  enqueueDiagnosisJobSchema,
  finishDiagnosisQueueJobSchema,
  listDiagnosisQueueSchema,
  sweepStartDiagnosisQueueSchema,
} from './dto/diagnosis-queue.dto';

@Controller('diagnose/queue')
export class DiagnosisQueueController {
  constructor(private readonly service: DiagnosisQueueService) {}

  @Get()
  list(@Query() input: unknown) {
    const parsed = listDiagnosisQueueSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid diagnosis queue query.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return this.service.list(parsed.data);
  }

  @Post('sweep-start')
  @HttpCode(HttpStatus.OK)
  sweepStart(@Body() input: unknown) {
    const parsed = sweepStartDiagnosisQueueSchema.safeParse(input ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid diagnosis queue sweep request.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return this.service.sweepStart(parsed.data);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  start(@Param() input: unknown) {
    const parsed = diagnosisQueueIdParamSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid diagnosis queue item ID.' });
    }
    return this.service.start(parsed.data);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param() input: unknown) {
    const parsed = diagnosisQueueIdParamSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid diagnosis queue item ID.' });
    }
    return this.service.cancel(parsed.data);
  }

  @Delete(':id')
  deleteOne(@Param() input: unknown) {
    const parsed = diagnosisQueueIdParamSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({ message: 'Invalid diagnosis queue item ID.' });
    }
    return this.service.deleteOne(parsed.data);
  }

  @Delete()
  clear(@Query() input: unknown) {
    const parsed = clearDiagnosisQueueSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid diagnosis queue clear request.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return this.service.clear(parsed.data);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  complete(@Body() input: unknown) {
    const parsed = finishDiagnosisQueueJobSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid diagnosis queue completion request.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return this.service.complete(parsed.data);
  }

  @Post('fail')
  @HttpCode(HttpStatus.OK)
  fail(@Body() input: unknown) {
    const parsed = finishDiagnosisQueueJobSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid diagnosis queue failure request.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return this.service.fail(parsed.data);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  enqueue(@Body() input: unknown) {
    const parsed = enqueueDiagnosisJobSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid diagnosis queue request.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return this.service.enqueue(parsed.data);
  }
}
