import { Injectable, NotFoundException } from '@nestjs/common';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DiagnoseRunSummaryDto, DiagnoseRunsResponseDto } from './dto/diagnose-run.dto';
import type { DiagnoseResponseDto } from './dto/diagnose-response.dto';

@Injectable()
export class DiagnoseArtifactsSchema {
  private readonly runsRoot = resolve(process.cwd(), 'runs');

  async findAll(): Promise<DiagnoseRunsResponseDto> {
    let names: string[];
    try {
      names = await readdir(this.runsRoot);
    } catch {
      return { runs: [] };
    }

    const runs = await Promise.all(
      names
        .filter((name) => name.startsWith('diagnose-'))
        .map((name) => this.readSummary(name)),
    );

    return {
      runs: runs
        .filter((run): run is DiagnoseRunSummaryDto => Boolean(run))
        .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? '')),
    };
  }

  async findById(runId: string): Promise<DiagnoseResponseDto> {
    const path = resolve(this.runsRoot, runId, 'diagnosis.json');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      throw new NotFoundException(`Diagnosis run ${runId} was not found.`);
    }
    return parsed as DiagnoseResponseDto;
  }

  private async readSummary(runId: string): Promise<DiagnoseRunSummaryDto | null> {
    try {
      const path = resolve(this.runsRoot, runId, 'diagnosis.json');
      const [contents, info] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
      const run = JSON.parse(contents) as DiagnoseResponseDto;
      return {
        runId: run.runId,
        artifactDirectory: run.artifactDirectory,
        jobId: run.jobId,
        startTurn: run.startTurn,
        endTurn: run.endTurn,
        summary: run.summary,
        findingCount: (run.llmFindings?.length ?? 0) + (run.patterns?.length ?? 0),
        createdAt: info.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }
}
