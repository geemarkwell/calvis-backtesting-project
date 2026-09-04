import { BadRequestException, NotFoundException } from '@nestjs/common';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ShiftBundle } from './copilot-simulation.types';

export function normalizeJobId(jobId: unknown): string {
  const normalized =
    typeof jobId === 'string'
      ? jobId.trim()
      : typeof jobId === 'number' && Number.isSafeInteger(jobId)
        ? String(jobId)
        : '';

  if (!/^\d+$/.test(normalized)) {
    throw new BadRequestException('jobId must contain digits only.');
  }

  return normalized;
}

export async function findBundleRoot(cwd = process.cwd()): Promise<string> {
  const configuredRoot = process.env.CALVIS_BUNDLE_ROOT;
  const candidates = [configuredRoot, cwd, resolve(cwd, '..')].filter(
    (candidate): candidate is string => Boolean(candidate),
  );

  for (const candidate of candidates) {
    try {
      await access(resolve(candidate, 'shifts'));
      await access(resolve(candidate, 'prompts', 'PROMPTS.md'));
      return candidate;
    } catch {
      // Try the next supported bundle layout.
    }
  }

  throw new Error(
    'Unable to locate bundle root. Set CALVIS_BUNDLE_ROOT to the directory containing shifts/ and prompts/.',
  );
}

export async function loadShiftBundle(
  bundleRoot: string,
  requestedJobId: unknown,
): Promise<{ jobId: string; bundle: ShiftBundle }> {
  const jobId = normalizeJobId(requestedJobId);
  const shiftPath = resolve(bundleRoot, 'shifts', `${jobId}.json`);

  let contents: string;
  try {
    contents = await readFile(shiftPath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new NotFoundException(`Shift ${jobId} was not found.`);
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new BadRequestException(`Shift ${jobId} contains invalid JSON.`);
  }

  if (!isShiftBundle(parsed)) {
    throw new BadRequestException(
      `Shift ${jobId} does not match expected shift bundle structure.`,
    );
  }

  return { jobId, bundle: parsed };
}

function isShiftBundle(value: unknown): value is ShiftBundle {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ShiftBundle>;
  return Boolean(
    candidate.shift &&
    candidate.shift.id !== undefined &&
    typeof candidate.shift.start === 'string' &&
    typeof candidate.shift.end === 'string' &&
    typeof candidate.shift.timezone === 'string' &&
    Array.isArray(candidate.events) &&
    Array.isArray(candidate.baseline),
  );
}
