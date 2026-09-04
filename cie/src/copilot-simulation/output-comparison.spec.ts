import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ShiftBundle } from './copilot-simulation.types';
import {
  buildHistoricalCopilotOutputs,
  copilotOutputsEqual,
  normalizeCopilotOutput,
} from './output-comparison';

async function loadFixture(jobId: string): Promise<ShiftBundle> {
  return JSON.parse(
    await readFile(
      resolve(process.cwd(), '..', 'shifts', `${jobId}.json`),
      'utf8',
    ),
  ) as ShiftBundle;
}

describe('Copilot output comparison', () => {
  it('normalizes tool prefixes, object keys, and message whitespace', () => {
    const left = normalizeCopilotOutput([
      {
        tool: 'mcp__calvis__request_copilot_dm',
        input: { body: 'All   clear. ', session_id: 'session-1' },
      },
      {
        tool: 'mcp__calvis__flag_copilot_guard',
        input: { severity: 'medium', reason: 'Mismatch' },
      },
    ]);
    const right = normalizeCopilotOutput([
      {
        tool: 'request_copilot_dm',
        input: { session_id: 'session-1', body: 'All clear.' },
      },
      {
        tool: 'flag_copilot_guard',
        input: { reason: 'Mismatch', severity: 'medium' },
      },
    ]);

    expect(copilotOutputsEqual(left, right)).toBe(true);
  });

  it('recovers historical messages, actions, and silence by turn', async () => {
    const aggressiveOutputs = buildHistoricalCopilotOutputs(
      await loadFixture('56370'),
    );
    const quietOutputs = buildHistoricalCopilotOutputs(
      await loadFixture('50837'),
    );

    expect(aggressiveOutputs.get(10)).toMatchObject({
      silent: false,
      messages: [expect.stringContaining('full perimeter')],
      actions: [expect.objectContaining({ tool: 'flag_copilot_guard' })],
    });
    expect(quietOutputs.get(8)).toEqual({
      messages: [],
      actions: [],
      silent: true,
    });
  });
});
