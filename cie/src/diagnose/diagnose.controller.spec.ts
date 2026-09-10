jest.mock('./runner', () => ({
  runDiagnose: jest.fn(),
}));

import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DiagnoseController } from './diagnose.controller';
import { DiagnoseService } from './diagnose.service';

describe('DiagnoseController', () => {
  const service = {
    discover: jest.fn().mockResolvedValue({
      runId: 'diagnose-test',
      artifactDirectory: '/tmp/diagnose-test',
      jobId: '56370',
      startTurn: 9,
      endTurn: 16,
      summary: 'Found 0 potential failure patterns.',
      patterns: [],
      llmFindings: [],
      noFindings: true,
    }),
  };
  let controller: DiagnoseController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DiagnoseController],
      providers: [{ provide: DiagnoseService, useValue: service }],
    }).compile();
    controller = moduleRef.get(DiagnoseController);
    service.discover.mockClear();
  });

  it('validates and forwards standard trace coordinates', async () => {
    await controller.discover({ jobId: '56370', startTurn: 9, endTurn: 16 });

    expect(service.discover).toHaveBeenCalledWith({
      jobId: '56370',
      startTurn: 9,
      endTurn: 16,
    });
  });

  it('rejects invalid turn ranges', () => {
    expect(() =>
      controller.discover({ jobId: '56370', startTurn: 16, endTurn: 9 }),
    ).toThrow(BadRequestException);
  });
});
