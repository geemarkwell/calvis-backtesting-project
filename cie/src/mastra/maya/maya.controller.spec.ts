jest.mock('./maya-judgment.service', () => ({
  MayaJudgmentService: class MayaJudgmentService {},
}));

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { MayaJudgmentService } from './maya-judgment.service';
import { MayaController } from './maya.controller';

describe('MayaController', () => {
  let app: INestApplication;
  const service = { getHistory: jest.fn(), judge: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MayaController],
      providers: [{ provide: MayaJudgmentService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes GET /maya/judgments by job ID', async () => {
    const result = { jobId: '56370', judgments: [] };
    service.getHistory.mockResolvedValue(result);
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .get('/maya/judgments')
      .query({ jobId: '56370' })
      .expect(200)
      .expect(result);

    expect(service.getHistory).toHaveBeenCalledWith({ jobId: '56370' });
  });

  it('exposes POST /maya/judge', async () => {
    const input = {
      callout: 'Copilot pushed too hard.',
      oldReplay: { replayMode: 'original' },
      candidateReplay: { replayMode: 'candidate' },
    };
    const result = { runId: 'maya-56370-1' };
    service.judge.mockResolvedValue(result);
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/maya/judge')
      .send(input)
      .expect(201)
      .expect(result);

    expect(service.judge).toHaveBeenCalledWith(input);
  });
});
