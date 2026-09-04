jest.mock('./theo.service', () => ({
  TheoService: class TheoService {},
}));
jest.mock('./candidate-decision.service', () => ({
  CandidateDecisionService: class CandidateDecisionService {},
}));

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TheoController } from './theo.controller';
import { TheoService } from './theo.service';
import { CandidateDecisionService } from './candidate-decision.service';

describe('TheoController', () => {
  let app: INestApplication;
  const theoService = {
    diagnose: jest.fn(),
  };
  const candidateDecisionService = {
    accept: jest.fn(),
    reject: jest.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [TheoController],
      providers: [
        { provide: TheoService, useValue: theoService },
        {
          provide: CandidateDecisionService,
          useValue: candidateDecisionService,
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes POST /theo/diagnose', async () => {
    const body = {
      whatWentWrong: 'Copilot repeatedly challenged a completed patrol.',
      badResponses: [{ jobId: '56370', startTurn: 9, endTurn: 16 }],
      expectedBehavior: 'Acknowledge the credible completion report.',
    };
    const result = {
      runId: 'theo-test',
      artifactDirectory: '/tmp/theo-test',
      diagnosis: { failure_mode: 'Repeated pushback' },
      suggestedPromptChange: {
        file: 'core/obligations.md',
        old_text: 'Old prompt text.',
        new_text: 'New prompt text.',
        intended_effect: 'Avoid repeated pushback.',
      },
    };
    theoService.diagnose.mockResolvedValue(result);

    const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

    await request(httpServer)
      .post('/theo/diagnose')
      .send(body)
      .expect(200)
      .expect(result);

    expect(theoService.diagnose).toHaveBeenCalledWith(body);
  });

  it.each(['accept', 'reject'] as const)(
    'exposes POST /theo/candidates/%s',
    async (action) => {
      const body = { jobId: '56370', version: '0.1' };
      const result = {
        decision: {
          ...body,
          status: action === 'accept' ? 'accepted' : 'rejected',
        },
        updatedPrompt: { ...body, file: 'core/obligations.md' },
      };
      candidateDecisionService[action].mockResolvedValue(result);
      const httpServer = app.getHttpServer() as Parameters<typeof request>[0];

      await request(httpServer)
        .post(`/theo/candidates/${action}`)
        .send(body)
        .expect(200)
        .expect(result);

      expect(candidateDecisionService[action]).toHaveBeenCalledWith(body);
    },
  );
});
