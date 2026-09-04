import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CopilotOriginalService } from './copilot-original.service';
import { CopilotBacktestService } from './copilot-backtest.service';
import { CopilotSimulationController } from './copilot-simulation.controller';
import { CopilotSimulationService } from './copilot-simulation.service';

jest.mock('./copilot-simulation.service', () => ({
  CopilotSimulationService: class CopilotSimulationService {},
}));
jest.mock('./copilot-original.service', () => ({
  CopilotOriginalService: class CopilotOriginalService {},
}));
jest.mock('./copilot-backtest.service', () => ({
  CopilotBacktestService: class CopilotBacktestService {},
}));

describe('CopilotSimulationController', () => {
  let app: INestApplication;
  const simulationService = {
    simulate: jest.fn(),
  };
  const originalService = {
    getOriginal: jest.fn(),
    listSources: jest.fn(),
  };
  const backtestService = {
    run: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CopilotSimulationController],
      providers: [
        { provide: CopilotSimulationService, useValue: simulationService },
        { provide: CopilotOriginalService, useValue: originalService },
        { provide: CopilotBacktestService, useValue: backtestService },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes POST /copilot/simulate', async () => {
    simulationService.simulate.mockResolvedValue({
      jobId: '56370',
      status: 'completed',
      startTurn: 8,
      endTurn: 8,
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
      turns: [],
      simulationNumber: 4,
      logFile: 'database/simulate-4.json',
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/copilot/simulate')
      .send({
        jobId: '56370',
        startTurn: 8,
        endTurn: 8,
        replayMode: 'candidate',
        promptVersion: '0.1',
        callNiko: false,
        debug: true,
      })
      .expect(200)
      .expect({
        jobId: '56370',
        status: 'completed',
        startTurn: 8,
        endTurn: 8,
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
        turns: [],
        simulationNumber: 4,
        logFile: 'database/simulate-4.json',
      });

    expect(simulationService.simulate).toHaveBeenCalledWith({
      jobId: '56370',
      startTurn: 8,
      endTurn: 8,
      replayMode: 'candidate',
      promptVersion: '0.1',
      callNiko: false,
      debug: true,
    });
  });

  it('exposes POST /copilot/backtest', async () => {
    const input = {
      jobId: '56370',
      startTurn: 8,
      endTurn: 11,
      replayMode: 'candidate',
      promptVersion: '0.1',
      callNiko: false,
      debug: false,
      callout: 'Copilot pushed too hard.',
      expectedBehavior: 'Acknowledge credible completed patrol reports.',
      baselineSource: 'shift',
    };
    const result = {
      oldReplay: { replayMode: 'original' },
      candidateReplay: {
        replayMode: 'candidate',
        updatedPrompt: {
          jobId: '56370',
          version: '0.1',
          file: 'core/obligations.md',
          oldText: 'Old text.',
          newText: 'New text.',
          intendedEffect: 'Improve behavior.',
        },
      },
      updatedPrompt: {
        jobId: '56370',
        version: '0.1',
        file: 'core/obligations.md',
        oldText: 'Old text.',
        newText: 'New text.',
        intendedEffect: 'Improve behavior.',
      },
      maya: { runId: 'maya-56370-1' },
      mayaError: null,
    };
    backtestService.run.mockResolvedValue(result);
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/copilot/backtest')
      .send(input)
      .expect(200)
      .expect(result);

    expect(backtestService.run).toHaveBeenCalledWith(input);
  });

  it('exposes GET /copilot/original', async () => {
    originalService.getOriginal.mockResolvedValue({
      jobId: '56370',
      status: 'completed',
      startTurn: 8,
      endTurn: 11,
      replayMode: 'original',
      callNiko: false,
      modelConfiguration: {
        model: 'recorded-shift-trace',
        maxRetries: 0,
        maxSteps: 0,
      },
      turns: [],
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/copilot/original')
      .query({ jobId: '56370', startTurn: 8, endTurn: 11 })
      .expect(200)
      .expect({
        jobId: '56370',
        status: 'completed',
        startTurn: 8,
        endTurn: 11,
        replayMode: 'original',
        callNiko: false,
        modelConfiguration: {
          model: 'recorded-shift-trace',
          maxRetries: 0,
          maxSteps: 0,
        },
        turns: [],
      });

    expect(originalService.getOriginal).toHaveBeenCalledWith({
      jobId: '56370',
      startTurn: '8',
      endTurn: '11',
    });
  });

  it('exposes GET /copilot/original-sources', async () => {
    originalService.listSources.mockResolvedValue({
      jobId: '56370',
      startTurn: 8,
      endTurn: 11,
      sources: [
        { id: 'shift', source: 'shift', label: 'Recorded shift' },
        {
          id: 'simulation:3',
          source: 'simulation',
          label: 'Agent v3',
          simulationNumber: 3,
        },
      ],
    });

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/copilot/original-sources')
      .query({ jobId: '56370', startTurn: 8, endTurn: 11 })
      .expect(200);

    expect(originalService.listSources).toHaveBeenCalledWith({
      jobId: '56370',
      startTurn: '8',
      endTurn: '11',
    });
  });
});
