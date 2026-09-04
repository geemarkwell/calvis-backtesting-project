import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type {
  CopilotSimulationResult,
  ShiftBundle,
} from './copilot-simulation.types';
import {
  nextSimulationNumber,
  writeSimulationLog,
} from './simulation-log-writer';

describe('simulation log writer', () => {
  let bundleRoot: string;

  beforeEach(async () => {
    bundleRoot = await mkdtemp(resolve(tmpdir(), 'copilot-simulation-log-'));
  });

  afterEach(async () => {
    await rm(bundleRoot, { recursive: true, force: true });
  });

  it('writes requested comparison fields and unchanged shift context', async () => {
    const bundle = buildBundle();
    const simulation = buildSimulation();

    const reference = await writeSimulationLog({
      bundleRoot,
      bundle,
      simulation,
    });
    const contents = await readFile(
      resolve(bundleRoot, 'cie', reference.logFile),
      'utf8',
    );
    const log = JSON.parse(contents) as Record<string, unknown>;

    expect(reference).toEqual({
      simulationNumber: 1,
      logFile: 'database/simulate-1.json',
    });
    expect(log).toMatchObject({
      simulationNumber: 1,
      jobId: '56370',
      startTurn: 9,
      endTurn: 9,
      updatedPrompt: simulation.updatedPrompt,
      context: bundle.shift,
      turns: [
        {
          turn: 9,
          trigger: 'guard_message',
          guardMessages: [
            {
              reply: 'Everything is clear.',
              source: 'historical',
              historicalReply: 'Everything is clear.',
            },
          ],
          events: simulation.turns[0].shiftEvents,
          originalCopilot: {
            messages: ['Please confirm.'],
            actions: [
              {
                tool: 'request_copilot_dm',
                input: { body: 'Please confirm.' },
              },
            ],
          },
          newCopilot: {
            messages: ['Thanks, logged.'],
            actions: [
              {
                tool: 'request_copilot_dm',
                input: { body: 'Thanks, logged.' },
              },
            ],
            modelText: 'Sent acknowledgement.',
            stopReason: 'stop',
            skipped: false,
          },
        },
      ],
    });
    expect(typeof log.createdAt).toBe('string');
  });

  it('uses highest existing simulation number and ignores unrelated files', async () => {
    await writeSimulationLog({
      bundleRoot,
      bundle: buildBundle(),
      simulation: buildSimulation(),
    });
    await writeFile(resolve(bundleRoot, 'cie', 'database', 'notes.json'), '{}');
    await writeFile(
      resolve(bundleRoot, 'cie', 'database', 'simulate-4.json'),
      '{}',
    );

    const reference = await writeSimulationLog({
      bundleRoot,
      bundle: buildBundle(),
      simulation: buildSimulation(),
    });

    expect(reference.simulationNumber).toBe(5);
    expect(reference.logFile).toBe('database/simulate-5.json');
  });

  it('does not overwrite files when simulations finish concurrently', async () => {
    const [first, second] = await Promise.all([
      writeSimulationLog({
        bundleRoot,
        bundle: buildBundle(),
        simulation: buildSimulation(),
      }),
      writeSimulationLog({
        bundleRoot,
        bundle: buildBundle(),
        simulation: buildSimulation(),
      }),
    ]);

    expect([first.simulationNumber, second.simulationNumber].sort()).toEqual([
      1, 2,
    ]);
  });

  it('calculates next number from valid filenames only', () => {
    expect(
      nextSimulationNumber([
        'simulate-2.json',
        'simulate-10.json',
        'simulate-x.json',
        'other-99.json',
      ]),
    ).toBe(11);
  });
});

function buildBundle(): ShiftBundle {
  return {
    shift: {
      id: 56370,
      start: '2026-08-04T23:00:00Z',
      end: '2026-08-05T10:00:00Z',
      timezone: 'America/New_York',
      instructions: ['Walk the full site.'],
    },
    events: [],
    baseline: [],
  };
}

function buildSimulation(): CopilotSimulationResult {
  return {
    jobId: '56370',
    status: 'completed',
    startTurn: 9,
    endTurn: 9,
    replayMode: 'candidate',
    callNiko: false,
    modelConfiguration: {
      model: 'openai/gpt-5-mini',
      maxRetries: 0,
      maxSteps: 8,
    },
    updatedPrompt: {
      jobId: '56370',
      version: '0.1',
      file: 'core/obligations.md',
      oldText: 'Old text.',
      newText: 'New text.',
      intendedEffect: 'Improve behavior.',
    },
    turns: [
      {
        turn: 9,
        trigger: 'guard_message',
        timestamp: '2026-08-05T02:02:25Z',
        shiftEvents: [
          {
            ts: '2026-08-05T02:02:00Z',
            type: 'guard_message',
            text: 'Everything is clear.',
          },
        ],
        guardMessages: ['Everything is clear.'],
        guardReplies: [
          {
            reply: 'Everything is clear.',
            source: 'historical',
            historicalReply: 'Everything is clear.',
          },
        ],
        copilotMessages: ['Thanks, logged.'],
        modelText: 'Sent acknowledgement.',
        finishReason: 'stop',
        toolCalls: [
          {
            tool: 'request_copilot_dm',
            input: { body: 'Thanks, logged.' },
          },
        ],
        silent: false,
        skipped: false,
        candidateCopilotOutput: {
          messages: ['Thanks, logged.'],
          actions: [
            {
              tool: 'request_copilot_dm',
              input: { body: 'Thanks, logged.' },
            },
          ],
          silent: false,
        },
        historicalCopilotOutput: {
          messages: ['Please confirm.'],
          actions: [
            {
              tool: 'request_copilot_dm',
              input: { body: 'Please confirm.' },
            },
          ],
          silent: false,
        },
        diverged: true,
        divergedThisTurn: true,
      },
    ],
  };
}
