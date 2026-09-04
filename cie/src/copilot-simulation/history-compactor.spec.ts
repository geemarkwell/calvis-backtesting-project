import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildHistoricalReplayState } from './history-compactor';
import type { ShiftBundle } from './copilot-simulation.types';
import { baseToolName } from './output-comparison';

async function loadFixture(jobId: string): Promise<ShiftBundle> {
  return JSON.parse(
    await readFile(
      resolve(process.cwd(), '..', 'shifts', `${jobId}.json`),
      'utf8',
    ),
  ) as ShiftBundle;
}

describe('historical replay compactor', () => {
  it('removes repeated raw history while preserving latest useful state', async () => {
    const state = buildHistoricalReplayState(
      await loadFixture('56370'),
      9,
      9674,
    );
    const names = state.toolCalls.map((call) => baseToolName(call.tool));
    const locationCalls = state.toolCalls.filter(
      (call) => baseToolName(call.tool) === 'get_guard_locations',
    );
    const jobLogCalls = state.toolCalls.filter(
      (call) => baseToolName(call.tool) === 'get_job_logs',
    );
    const serialized = JSON.stringify(state.toolCalls);

    expect(locationCalls).toHaveLength(1);
    expect(jobLogCalls).toHaveLength(1);
    expect(names).not.toContain('Write');
    expect(names).not.toContain('get_job_chat_messages');
    expect(names).not.toContain('get_copilot_message_history');
    expect(names).not.toContain('Read');
    expect(serialized).not.toContain('heartbeat_trend');
    expect(serialized.length).toBeLessThan(20_000);
    expect(state.workspace['workspace/analysis.md']).toContain(
      '# Shift Analysis',
    );
    expect(state.retainedChatKeys.size).toBeLessThanOrEqual(20);
  });
});
