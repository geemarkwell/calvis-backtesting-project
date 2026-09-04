import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  buildCopilotTurnMessage,
  instructionFileForTrigger,
} from './turn-builder';

const promptRoot = resolve(process.cwd(), '..', 'prompts');

describe('copilot turn builder', () => {
  it.each([
    ['session_start', 'session_start.md'],
    ['guard_message', 'guard_response.md'],
    ['guard_in_transit', 'job_event.md'],
    ['guard_checked_in', 'job_event.md'],
    ['shift_ending', 'default.md'],
    ['unknown_trigger', 'default.md'],
  ])('maps %s to %s', (trigger, expectedFile) => {
    expect(instructionFileForTrigger(trigger)).toBe(expectedFile);
  });

  it('places unmodified trigger instructions before turn data', async () => {
    const instruction = await readFile(
      resolve(promptRoot, 'instructions', 'guard_response.md'),
      'utf8',
    );
    const message = await buildCopilotTurnMessage({
      promptRoot,
      sessionId: 'session-1',
      jobId: 56370,
      assignedGuards: [{ id: 9674, name: 'Hector Nguyen' }],
      turnNumber: 20,
      trigger: 'guard_message',
      currentTime: 'Tuesday 2026-08-04T22:29:56 America/New_York',
      timeLeftMinutes: 450,
      jobEvents: 'No new job events.',
    });

    expect(message).toContain(instruction);
    expect(message.indexOf(instruction)).toBeLessThan(
      message.indexOf('## Job Events'),
    );
    expect(message).toContain('## Turn 20 (triggered by: guard_message)');
    expect(message).toContain(
      '**Time left on shift (authoritative):** 450 min',
    );
    expect(message.trimEnd().endsWith('450 min')).toBe(true);
  });

  it('matches production guard-message example byte for byte', async () => {
    const rendered = await readFile(
      resolve(promptRoot, 'turn_message', 'guard_message.md'),
      'utf8',
    );
    const expected = rendered.replace(/^<!--[\s\S]*?-->\n\n/, '');
    const message = await buildCopilotTurnMessage({
      promptRoot,
      sessionId: '8f3c1d42-0b77-4e19-9a52-6c1e2f0ad7b3',
      jobId: 56370,
      assignedGuards: [{ id: 4021, name: 'Hector Nguyen' }],
      turnNumber: 20,
      trigger: 'guard_message',
      currentTime: 'Tuesday 2026-08-04T22:29:56 America/New_York',
      timeLeftMinutes: 450,
    });

    expect(`${message}\n`).toBe(expected);
    expect(message).not.toContain('The guard had just sent');
  });

  it('matches production session-start example byte for byte', async () => {
    const rendered = await readFile(
      resolve(promptRoot, 'turn_message', 'session_start.md'),
      'utf8',
    );
    const expected = rendered.replace(/^<!--[\s\S]*?-->\n\n/, '');
    const message = await buildCopilotTurnMessage({
      promptRoot,
      sessionId: '8f3c1d42-0b77-4e19-9a52-6c1e2f0ad7b3',
      jobId: 56370,
      assignedGuards: [{ id: 4021, name: 'Hector Nguyen' }],
      turnNumber: 1,
      trigger: 'session_start',
      currentTime: 'Tuesday 2026-08-04T17:01:09 America/New_York',
      minutesUntilShiftStart: 119,
      jobContext: [
        '- Job #56370: Bellview Logistics',
        '- Location: 5341 Calloway Ave, Springfield, IL 62701',
        '- Guards: Hector Nguyen',
        '- Full details in context/job.json',
      ].join('\n'),
    });

    expect(`${message}\n`).toBe(expected);
  });

  it('requires exactly one server-computed timing value', async () => {
    const baseInput = {
      promptRoot,
      sessionId: 'session-1',
      jobId: 56370,
      assignedGuards: [{ id: 9674, name: 'Hector Nguyen' }],
      turnNumber: 1,
      trigger: 'session_start',
      currentTime: 'Tuesday 2026-08-04T17:01:00 America/New_York',
    };

    await expect(buildCopilotTurnMessage(baseInput)).rejects.toThrow(
      'Provide exactly one',
    );
    await expect(
      buildCopilotTurnMessage({
        ...baseInput,
        timeLeftMinutes: 660,
        minutesUntilShiftStart: 119,
      }),
    ).rejects.toThrow('Provide exactly one');
  });
});
