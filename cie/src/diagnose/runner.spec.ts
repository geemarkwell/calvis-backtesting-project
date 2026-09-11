jest.mock('../mastra/agents/context-evaluator-agent', () => ({
  contextEvaluatorAgent: { generate: jest.fn() },
}));
jest.mock('../mastra/agents/safety-recovery-evaluator-agent', () => ({
  safetyRecoveryEvaluatorAgent: { generate: jest.fn() },
}));
jest.mock('../mastra/agents/task-success-evaluator-agent', () => ({
  taskSuccessEvaluatorAgent: { generate: jest.fn() },
}));
jest.mock('../mastra/agents/tool-use-evaluator-agent', () => ({
  toolUseEvaluatorAgent: { generate: jest.fn() },
}));
jest.mock('../mastra/agents/free-agent-evaluator-agent', () => ({
  freeAgentEvaluatorAgent: { generate: jest.fn() },
}));
jest.mock('../mastra/agents/prompt-issue-evaluator-agent', () => ({
  promptIssueEvaluatorAgent: { generate: jest.fn() },
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
      lenses: [],
      trace: [],
      intervalEvents: [],
    });

    expect(message).toContain('<diagnose_input>');
    expect(message).toContain('untrusted evidence data');
    expect(message).toContain('Lens focus areas');
    expect(message).toContain('Stay out of scope');
  });

  it('returns specialized LLM findings and writes artifacts', async () => {
    const generateFindings = jest
      .fn()
      .mockResolvedValueOnce({ summary: 'Task issue found.', findings: [finding] })
      .mockResolvedValue({ summary: 'No issue found.', findings: [] });
    const result = await runDiagnose(
      {
        request: { jobId: '56370', startTurn: 9, endTurn: 9 },
        runsRoot,
        runId: 'diagnose-unit-test',
      },
      { generateFindings },
    );

    expect(generateFindings).toHaveBeenCalledTimes(6);
    expect(result.lenses).toHaveLength(6);
    expect(result.evaluatorReports).toHaveLength(6);
    expect(result.evaluatorReports[0].lens?.id).toBe('task-success');
    expect(result.llmFindings).toEqual([
      expect.objectContaining({
        ...finding,
        expectedBehavior: expect.stringContaining(finding.suggestedFix),
      }),
    ]);
    await expect(
      readFile(join(result.artifactDirectory, 'llm-findings.json'), 'utf8'),
    ).resolves.toContain('llm-tool-loop');
  });

  it('normalizes non-prompt candidate hints to manual validation', async () => {
    const workflowFinding = {
      ...finding,
      suggestedCandidateKind: 'workflow' as const,
      candidateKindRationale: 'State should carry unresolved compliance forward.',
      replayableHint: true,
      requiresManualValidationHint: false,
    };
    const result = await runDiagnose(
      {
        request: { jobId: '56370', startTurn: 9, endTurn: 9, lensIds: ['task-success'] },
        runsRoot,
        runId: 'diagnose-candidate-kind-test',
      },
      {
        generateFindings: jest.fn().mockResolvedValue({
          summary: 'Workflow issue found.',
          findings: [workflowFinding],
        }),
      },
    );

    expect(result.llmFindings[0]).toMatchObject({
      suggestedCandidateKind: 'workflow',
      replayableHint: false,
      requiresManualValidationHint: true,
    });
  });

  it('runs only explicitly selected lenses', async () => {
    const generateFindings = jest
      .fn()
      .mockResolvedValue({ summary: 'No issue found.', findings: [] });
    const result = await runDiagnose(
      {
        request: {
          jobId: '56370',
          startTurn: 9,
          endTurn: 9,
          lensIds: ['tool-use'],
        },
        runsRoot,
        runId: 'diagnose-lens-subset-test',
      },
      { generateFindings },
    );

    expect(generateFindings).toHaveBeenCalledTimes(1);
    expect(result.lenses.map((lens) => lens.id)).toEqual(['tool-use']);
    expect(result.evaluatorReports.map((report) => report.evaluatorId)).toEqual([
      'tool-use',
    ]);
  });
});
