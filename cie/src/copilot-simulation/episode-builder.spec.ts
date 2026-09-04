import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildSimulationEpisode } from './episode-builder';
import type { ShiftBundle } from './copilot-simulation.types';

async function loadFixture(jobId: string): Promise<ShiftBundle> {
  return JSON.parse(
    await readFile(
      resolve(process.cwd(), '..', 'shifts', `${jobId}.json`),
      'utf8',
    ),
  ) as ShiftBundle;
}

describe('simulation episode builder', () => {
  it('selects five scheduled turns from job 50837', async () => {
    const episode = buildSimulationEpisode(await loadFixture('50837'), 8, 12);

    expect(episode.selectedTurns.map((turn) => turn.turn)).toEqual([
      8, 9, 10, 11, 12,
    ]);
    expect(
      episode.selectedTurns.every(
        (turn) => turn.trigger === 'scheduled_check_in',
      ),
    ).toBe(true);
    expect(episode.replayToolCalls.length).toBeGreaterThan(0);
    expect(typeof episode.replayToolCalls[0].turn).toBe('number');
    expect(typeof episode.replayToolCalls[0].timestamp).toBe('string');
    expect(typeof episode.replayToolCalls[0].input).toBe('object');
  });

  it('rejects invalid and empty turn ranges', async () => {
    const fixture = await loadFixture('56370');

    expect(() => buildSimulationEpisode(fixture, 10, 8)).toThrow(
      'startTurn cannot be greater',
    );
    expect(() => buildSimulationEpisode(fixture, 999, 1000)).toThrow(
      'No turns found',
    );
  });
});
