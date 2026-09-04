import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCopilotRequestContext } from './request-context';
import { buildCopilotTurnMessage } from './turn-builder';
import type { CopilotShift, RecordedReplayToolCall } from './types';

const bundleRoot = resolve(process.cwd(), '..');

describe('copilot shift 56370 smoke fixture', () => {
  it('prepares real shift context, history boundary, turn, and tool evidence', async () => {
    const fixture = JSON.parse(
      await readFile(resolve(bundleRoot, 'shifts', '56370.json'), 'utf8'),
    ) as {
      shift: CopilotShift;
      baseline: RecordedReplayToolCall[];
    };
    const replayToolCalls = fixture.baseline.filter(
      (entry): entry is RecordedReplayToolCall => entry.tool !== undefined,
    );
    const promptRoot = resolve(bundleRoot, 'prompts');
    const requestContext = await createCopilotRequestContext({
      promptRoot,
      shift: fixture.shift,
      replayToolCalls,
    });
    const turnMessage = await buildCopilotTurnMessage({
      promptRoot,
      sessionId: 'replay-56370',
      jobId: fixture.shift.id,
      assignedGuards: [{ id: 9674, name: 'Hector Nguyen' }],
      turnNumber: 20,
      trigger: 'guard_message',
      currentTime: 'Tuesday 2026-08-04T22:29:56 America/New_York',
      timeLeftMinutes: 450,
    });
    const systemPrompt = requestContext.get('copilot-system-prompt');

    expect(systemPrompt).toEqual(expect.stringContaining('"id": "56370"'));
    expect(turnMessage).toContain('## Guard reply: reactive, high priority');
    expect(turnMessage).not.toContain('Ok I already did that');
    expect(replayToolCalls.length).toBeGreaterThan(0);
  });
});
