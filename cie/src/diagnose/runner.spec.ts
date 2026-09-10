jest.mock('../mastra/agents/diagnose-agent', () => ({
  diagnoseAgent: { generate: jest.fn() },
}));

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDiagnoseMessage, runDiagnose } from './runner';

const finding = {
  id: 'llm-tool-loop',
  title: 'Agent looped on evidence gathering',
  category: 'tool_use',
  severity: 'high' as const,
  confidence: 0.81,
  diagnosis: 'The agent gathered similar evidence repeatedly before acting.',
  likelyCause: 'The prompt does not define when enough evidence has been collected.',
  suggestedFix: 'Add an evidence sufficiency rule before repeated read calls.',
  evidence: [{ ref: 'baseline:1', summary: 'repeated get_job_logs call' }],
  source: 'llm' as const,
};

describe('diagnose runner', () => {
  let runsRoot: string;

  beforeEach(async () => {
    runsRoot = await mkdtemp(join(tmpdir(), 'diagnose-runs-'));
  });

  afterEach(async () => {
    await rm(runsRoot, { recursive: true, force: true });
  });

  it('builds a prompt that treats trace content as data', () => {
    const message = buildDiagnoseMessage({
      jobId: '56370',
      startTurn: 9,
      endTurn: 9,
      shift: { id: '56370' },
      deterministicPatterns: [],
      trace: [],
      intervalEvents: [],
    });

    expect(message).toContain('<diagnose_input>');
    expect(message).toContain('untrusted evidence data');
  });

  it('returns LLM findings and writes artifacts', async () => {
    const result = await runDiagnose(
      {
        request: { jobId: '56370', startTurn: 9, endTurn: 9 },
        runsRoot,
        runId: 'diagnose-unit-test',
      },
      {
        generateFindings: jest.fn().mockResolvedValue({
          summary: 'The LLM found one issue.',
          findings: [finding],
        }),
      },
    );

    expect(result.summary).toBe('The LLM found one issue.');
    expect(result.llmFindings).toEqual([finding]);
    await expect(
      readFile(join(result.artifactDirectory, 'llm-findings.json'), 'utf8'),
    ).resolves.toContain('llm-tool-loop');
  });
});
