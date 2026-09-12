import { AnalyticsService } from './analytics.service';
import type { AnalyticsSchema } from './analytics.schema';

describe('AnalyticsService', () => {
  it('aggregates lens performance into ranked sections and trend data', async () => {
    const schema = {
      lensPerformance: jest.fn().mockResolvedValue([
        {
          lensId: 'task-success',
          lensName: 'Task Success',
          diagnosisFindingCount: 4,
          mayaEvalCount: 2,
          mayaPassCount: 1,
          mayaFailCount: 1,
          mayaPassRate: 0.5,
        },
        {
          lensId: 'tool-use',
          lensName: 'Tool Use',
          diagnosisFindingCount: 2,
          mayaEvalCount: 2,
          mayaPassCount: 2,
          mayaFailCount: 0,
          mayaPassRate: 1,
        },
      ]),
      mayaOutcomeTrend: jest.fn().mockResolvedValue([
        { bucket: '2026-09-11', passCount: 3, failCount: 1, totalCount: 4 },
      ]),
    } as unknown as AnalyticsSchema;
    const service = new AnalyticsService(schema);

    const result = await service.lensPerformance({ range: 'day' });

    expect(result.summary).toEqual({
      diagnosisFindingCount: 6,
      mayaEvalCount: 4,
      mayaPassCount: 3,
      mayaFailCount: 1,
      mayaPassRate: 0.75,
    });
    expect(result.mostDiagnosisFailures[0].lensId).toBe('task-success');
    expect(result.mostMayaPasses[0].lensId).toBe('tool-use');
    expect(result.mostMayaFails[0].lensId).toBe('task-success');
    expect(result.mayaOutcomeTrend).toHaveLength(1);
  });
});
