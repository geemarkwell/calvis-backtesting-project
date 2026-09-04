import { Module } from '@nestjs/common';
import { MastraModule } from '@mastra/nestjs';
import { mastra } from '../mastra';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';

@Module({
  imports: [MastraModule.register({ mastra })],
  controllers: [MemoryController],
  providers: [MemoryService],
})
export class MemoryModule {}
