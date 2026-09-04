import { BadRequestException } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import type { ShiftBundle } from './copilot-simulation.types';
import { CopilotOriginalService } from './copilot-original.service';
import { buildHistoricalCopilotOutputs } from './output-comparison';
import {
  findBundleRoot,
  loadShiftBundle,
  normalizeJobId,
} from './shift-loader';

jest.mock('./shift-loader');
jest.mock('./output-comparison');
jest.mock('node:fs/promises');

const mockedFindBundleRoot = jest.mocked(findBundleRoot);
const mockedLoadShiftBundle = jest.mocked(loadShiftBundle);
const mockedNormalizeJobId = jest.mocked(normalizeJobId);
const mockedBuildHistoricalCopilotOutputs = jest.mocked(
  buildHistoricalCopilotOutputs,
);
const mockedReaddir = jest.mocked(readdir);
const mockedReadFile = jest.mocked(readFile);

const bundle = {
  shift: {
    id: 56370,
    start: '2026-08-05T00:00:00.000Z',
    end: '2026-08-05T06:00:00.000Z',
    timezone: 'America/New_York',
  },
  events: [
    {
      ts: '2026-08-05T01:55:00.000Z',
      type: 'guard_message',
      text: 'Recorded guard message for turn eight.',
    },
    {
      ts: '2026-08-05T02:01:30.000Z',
      type: 'guard_message',
      audio_transcription: 'Recorded guard message for turn nine.',
    },
  ],
  baseline: [
    {
      ts: '2026-08-05T01:50:00.000Z',
      type: 'turn_start',
      turn: 7,
      trigger: 'scheduled_check_in',
    },
    {
      ts: '2026-08-05T02:01:00.000Z',
      type: 'turn_start',
      turn: 8,
      trigger: 'scheduled_check_in',
    },
    {
      ts: '2026-08-05T02:02:00.000Z',
      type: 'turn_start',
      turn: 9,
      trigger: 'guard_message',
    },
  ],
} as ShiftBundle;

const simulationLog = {
  simulationNumber: 3,
  createdAt: '2026-09-04T04:12:57.028Z',
  jobId: '56370',
  startTurn: 8,
  endTurn: 9,
  replayMode: 'candidate',
  callNiko: false,
  modelConfiguration: {
    model: 'openai/gpt-5-mini',
    maxRetries: 0,
    maxSteps: 8,
  },
  context: bundle.shift,
  turns: [
    {
      turn: 8,
      timestamp: '2026-08-05T02:01:00.000Z',
      trigger: 'scheduled_check_in',
      guardMessages: [],
      events: [],
      originalCopilot: {
        messages: ['Recorded shift message.'],
        actions: [],
        silent: false,
      },
      newCopilot: {
        messages: ['Saved agent message.'],
        actions: [],
        silent: false,
        modelText: 'Saved agent message.',
        stopReason: 'stop',
        skipped: false,
      },
    },
    {
      turn: 9,
      timestamp: '2026-08-05T02:02:00.000Z',
      trigger: 'guard_message',
      guardMessages: [
        {
          reply: 'Saved guard message.',
          source: 'historical',
          historicalReply: 'Saved guard message.',
        },
      ],
      events: [],
      originalCopilot: { messages: [], actions: [], silent: true },
      newCopilot: {
        messages: [],
        actions: [],
        silent: true,
        modelText: null,
        stopReason: 'stop',
        skipped: false,
      },
    },
  ],
};

describe('CopilotOriginalService', () => {
  const service = new CopilotOriginalService();

  beforeEach(() => {
    jest.resetAllMocks();
    mockedFindBundleRoot.mockResolvedValue('/bundle');
    mockedNormalizeJobId.mockImplementation((value) => String(value));
    mockedLoadShiftBundle.mockResolvedValue({ jobId: '56370', bundle });
    mockedBuildHistoricalCopilotOutputs.mockReturnValue(
      new Map([
        [
          8,
          {
            messages: ['Recorded Copilot message for turn eight.'],
            actions: [],
            silent: false,
          },
        ],
        [9, { messages: [], actions: [], silent: true }],
      ]),
    );
  });

  it('returns recorded guard and Copilot output without simulation metadata', async () => {
    const result = await service.getOriginal({
      jobId: '56370',
      startTurn: '8',
      endTurn: '9',
    });

    expect(result).toMatchObject({
      jobId: '56370',
      startTurn: 8,
      endTurn: 9,
      replayMode: 'original',
      callNiko: false,
      modelConfiguration: { model: 'recorded-shift-trace' },
    });
    expect(result.turns[0]).toMatchObject({
      turn: 8,
      guardMessages: ['Recorded guard message for turn eight.'],
      copilotMessages: ['Recorded Copilot message for turn eight.'],
      finishReason: 'recorded',
      diverged: false,
    });
    expect(result.turns[1]).toMatchObject({
      turn: 9,
      guardMessages: ['Recorded guard message for turn nine.'],
      copilotMessages: [],
      silent: true,
    });
  });

  it('rejects invalid query turn values', async () => {
    await expect(
      service.getOriginal({
        jobId: '56370',
        startTurn: 'eight',
        endTurn: '9',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists compatible saved agent versions after the recorded shift', async () => {
    mockedReaddir.mockResolvedValue(['simulate-3.json', 'notes.txt'] as never);
    mockedReadFile.mockResolvedValue(JSON.stringify(simulationLog));

    const result = await service.listSources({
      jobId: '56370',
      startTurn: '8',
      endTurn: '9',
    });

    expect(result.sources.map((source) => source.id)).toEqual([
      'shift',
      'simulation:3',
    ]);
  });

  it('loads shift turns with the selected saved agent output', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify(simulationLog));

    const result = await service.getOriginal({
      jobId: '56370',
      startTurn: '8',
      endTurn: '9',
      source: 'simulation',
      simulationNumber: '3',
    });

    expect(result.modelConfiguration.model).toBe('openai/gpt-5-mini');
    expect(result.turns[0].copilotMessages).toEqual(['Saved agent message.']);
    expect(result.turns[0].timestamp).toBe('2026-08-05T02:01:00.000Z');
    expect(result.turns[1].trigger).toBe('guard_message');
    expect(result.turns[1].guardMessages).toEqual([
      'Recorded guard message for turn nine.',
    ]);
    expect(result.turns[1].guardReplies).toEqual([
      {
        reply: 'Recorded guard message for turn nine.',
        source: 'historical',
        historicalReply: 'Recorded guard message for turn nine.',
      },
    ]);
  });
});
