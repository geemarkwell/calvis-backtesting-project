import { Injectable } from '@nestjs/common';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  savedTestFailureSchema,
  type SavedTestFailureDto,
} from './dto/test-failure.dto';

const FAILURE_FILE_PATTERN = /^failure-[A-Za-z0-9_-]+\.json$/;

@Injectable()
export class TestFailuresSchema {
  private readonly root: string;

  constructor() {
    this.root = resolve(process.cwd(), 'test-failures');
  }

  async create(dto: SavedTestFailureDto): Promise<SavedTestFailureDto> {
    await mkdir(this.root, { recursive: true });
    let suffix = 0;
    while (true) {
      const id = suffix === 0 ? dto.id : `${dto.id}-${suffix + 1}`;
      const path = resolve(this.root, `${id}.json`);
      try {
        const record = savedTestFailureSchema.parse({ ...dto, id });
        await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, {
          encoding: 'utf8',
          flag: 'wx',
        });
        return record;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
        suffix += 1;
      }
    }
  }

  async findAll(): Promise<SavedTestFailureDto[]> {
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root, { withFileTypes: true });
    const records = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && FAILURE_FILE_PATTERN.test(entry.name))
        .map(async (entry) => {
          const { readFile } = await import('node:fs/promises');
          return savedTestFailureSchema.parse(
            JSON.parse(await readFile(resolve(this.root, entry.name), 'utf8')),
          );
        }),
    );
    return records.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  }
}
