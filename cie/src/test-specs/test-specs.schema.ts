import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  savedTestSpecSchema,
  type SavedTestSpecDto,
} from './dto/test-spec.dto';

const TEST_SPEC_FILE_PATTERN = /^([a-z0-9][a-z0-9-]*)\.json$/;
export const TEST_SPECS_ROOT = Symbol('TEST_SPECS_ROOT');

@Injectable()
export class TestSpecsSchema {
  private readonly root: string;

  constructor(@Optional() @Inject(TEST_SPECS_ROOT) root?: string) {
    this.root = root ?? resolve(process.cwd(), 'test-specs');
  }

  async create(spec: SavedTestSpecDto): Promise<SavedTestSpecDto> {
    await this.ensureRoot();
    const path = this.pathFor(spec.id);
    try {
      await writeFile(path, stringify(spec), { encoding: 'utf8', flag: 'wx' });
      return spec;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new ConflictException(`Test spec ${spec.id} already exists.`);
      }
      throw error;
    }
  }

  async findAll(): Promise<SavedTestSpecDto[]> {
    await this.ensureRoot();
    const entries = await readdir(this.root, { withFileTypes: true });
    const specs = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && TEST_SPEC_FILE_PATTERN.test(entry.name))
        .map((entry) => this.findById({ id: entry.name.replace(/\.json$/, '') })),
    );
    return specs.sort((left, right) => left.id.localeCompare(right.id));
  }

  async findById(input: { id: string }): Promise<SavedTestSpecDto> {
    try {
      const parsed = JSON.parse(await readFile(this.pathFor(input.id), 'utf8'));
      return savedTestSpecSchema.parse(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`Test spec ${input.id} not found.`);
      }
      throw error;
    }
  }

  async update(spec: SavedTestSpecDto): Promise<SavedTestSpecDto> {
    await this.findById({ id: spec.id });
    await writeFileAtomically(this.pathFor(spec.id), stringify(spec));
    return spec;
  }

  async exists(input: { id: string }): Promise<boolean> {
    try {
      await this.findById(input);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return false;
      }
      throw error;
    }
  }

  private ensureRoot(): Promise<void> {
    return mkdir(this.root, { recursive: true }).then(() => undefined);
  }

  private pathFor(id: string): string {
    return resolve(this.root, `${id}.json`);
  }
}

async function writeFileAtomically(path: string, contents: string): Promise<void> {
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, contents, 'utf8');
  await rename(tmpPath, path);
}

function stringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
