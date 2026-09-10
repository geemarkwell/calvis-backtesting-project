import { contextEvaluatorAgent } from '../mastra/agents/context-evaluator-agent';
import { freeAgentEvaluatorAgent } from '../mastra/agents/free-agent-evaluator-agent';
import { promptIssueEvaluatorAgent } from '../mastra/agents/prompt-issue-evaluator-agent';
import { safetyRecoveryEvaluatorAgent } from '../mastra/agents/safety-recovery-evaluator-agent';
import { taskSuccessEvaluatorAgent } from '../mastra/agents/task-success-evaluator-agent';
import { toolUseEvaluatorAgent } from '../mastra/agents/tool-use-evaluator-agent';
import type { DiagnoseLensDto, DiagnoseLensIdDto } from './dto/diagnose-lens.dto';

export interface DiagnoseLensConfig extends DiagnoseLensDto {
  task: string;
  agent: {
    generate: (
      message: string,
      options: Record<string, unknown>,
    ) => Promise<{ object?: unknown }>;
  };
}

export const DIAGNOSE_LENSES: readonly DiagnoseLensConfig[] = [
  {
    id: 'task-success',
    name: 'Task Success Evaluator',
    description: 'Diagnoses whether the agent completed the intended task and produced a correct final outcome.',
    focusAreas: [
      'task completion',
      'final outcome correctness',
      'client-required condition satisfaction',
      'claims of success without actual success',
    ],
    exclusions: ['tool style', 'context management', 'safety unless it directly affects task success'],
    task: 'Look only for task completion, final outcome correctness, required condition satisfaction, and false success claims.',
    agent: taskSuccessEvaluatorAgent,
  },
  {
    id: 'tool-use',
    name: 'Tool Use Evaluator',
    description: 'Diagnoses tool selection, arguments, failures, repeated calls, interpretation, and recovery.',
    focusAreas: [
      'correct tool selection',
      'correct arguments',
      'repeated or unnecessary calls',
      'tool failures',
      'incorrect interpretation of results',
      'missing purpose-built tools',
      'recovery after failure',
    ],
    exclusions: ['broad task quality', 'context management', 'safety unless it directly affects tool use'],
    task: 'Look only for tool selection, arguments, repeated calls, failures, result interpretation, missing purpose-built tools, and recovery after tool failure.',
    agent: toolUseEvaluatorAgent,
  },
  {
    id: 'context',
    name: 'Context Evaluator',
    description: 'Diagnoses whether the agent had, retained, retrieved, and used the right information.',
    focusAreas: [
      'missing important context',
      'irrelevant context overload',
      'retrieval failures',
      'unsupported claims',
      'important information lost during compaction',
    ],
    exclusions: ['tool style', 'task outcome', 'safety unless it directly affects context quality'],
    task: 'Look only for missing important context, irrelevant context overload, retrieval failures, unsupported claims, and compaction loss.',
    agent: contextEvaluatorAgent,
  },
  {
    id: 'safety-recovery',
    name: 'Safety and Recovery Evaluator',
    description: 'Diagnoses permission boundaries, unsafe actions, ambiguity handling, and recovery from errors.',
    focusAreas: [
      'permission violations',
      'actions requiring approval',
      'unsafe behavior',
      'failure to handle ambiguity',
      'poor recovery from errors',
    ],
    exclusions: ['broad task quality', 'context management', 'tool style unless it directly affects safety or recovery'],
    task: 'Look only for permission violations, approval-required actions, unsafe behavior, ambiguity handling, and recovery from errors.',
    agent: safetyRecoveryEvaluatorAgent,
  },
  {
    id: 'prompt-issue',
    name: 'Prompt Issue Evaluator',
    description: 'Diagnoses whether failures are likely caused by prompt instructions rather than tools, context, code, or workflow.',
    focusAreas: [
      'missing prompt instructions',
      'ambiguous or conflicting prompt rules',
      'incorrect prompt priorities',
      'over-broad or over-specific instructions',
      'minimal prompt changes that could improve behavior',
      'false attribution when an issue is not prompt-rooted',
    ],
    exclusions: [
      'application-code edits',
      'tool-contract changes',
      'database or UI changes',
      'claiming a prompt fix worked without a replay',
    ],
    task: 'Look only for prompt-rooted failure causes: missing, ambiguous, conflicting, overly broad, overly specific, or incorrectly prioritized prompt instructions. Do not assume the issue is prompt-rooted when evidence points elsewhere.',
    agent: promptIssueEvaluatorAgent,
  },
  {
    id: 'free-agent',
    name: 'Free Agent Evaluator',
    description: 'Diagnoses uncovered loopholes, vulnerabilities, cross-lens failures, silent failure modes, and other risks.',
    focusAreas: [
      'uncovered failure modes',
      'loopholes and vulnerabilities',
      'cross-lens interactions',
      'silent failures',
      'unexpected regressions',
      'workflow or incentive edge cases',
    ],
    exclusions: ['issues already fully explained by a narrower lens unless the cross-lens interaction changes severity'],
    task: 'Look broadly for important loopholes, vulnerabilities, silent failures, cross-lens interactions, workflow edge cases, and other risks not fully covered by the constrained lenses.',
    agent: freeAgentEvaluatorAgent,
  },
] as const;

export function getDiagnoseLensConfigs(
  lensIds?: readonly DiagnoseLensIdDto[],
): DiagnoseLensConfig[] {
  if (!lensIds || lensIds.length === 0) {
    return [...DIAGNOSE_LENSES];
  }
  const byId = new Map(DIAGNOSE_LENSES.map((lens) => [lens.id, lens]));
  return lensIds.map((id) => byId.get(id)).filter((lens): lens is DiagnoseLensConfig => Boolean(lens));
}

export function publicDiagnoseLens(lens: DiagnoseLensConfig): DiagnoseLensDto {
  return {
    id: lens.id,
    name: lens.name,
    description: lens.description,
    focusAreas: lens.focusAreas,
    exclusions: lens.exclusions,
  };
}
