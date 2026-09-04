import { Inject, Injectable } from '@nestjs/common';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { MASTRA } from '@mastra/nestjs';
import { Mastra } from '@mastra/core/mastra';

@Injectable()
export class MemoryService {
  constructor(@Inject(MASTRA) private readonly mastra: Mastra) {}

  async getThreadMessages(threadId: string) {
    const agent = this.mastra.getAgent('weatherAgent');
    const memory = await agent.getMemory();
    return memory?.recall({ threadId });
  }

  create(createMemoryDto: CreateMemoryDto) {
    return 'This action adds a new memory';
  }

  findAll() {
    return `This action returns all memory`;
  }

  findOne(id: number) {
    return `This action returns a #${id} memory`;
  }

  update(id: number, updateMemoryDto: UpdateMemoryDto) {
    return `This action updates a #${id} memory`;
  }

  remove(id: number) {
    return `This action removes a #${id} memory`;
  }
}
