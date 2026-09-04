import { RequestContext } from '@mastra/core/request-context';
import { assembleCopilotSystemPrompt } from './prompt-loader';
import type {
  CopilotRequestContext,
  CopilotReplayMode,
  CopilotShift,
  ReplayEvidence,
  RecordedReplayToolCall,
} from './types';

export interface CreateCopilotRequestContextInput {
  promptRoot: string;
  shift: CopilotShift;
  evidence?: ReplayEvidence;
  replayMode?: CopilotReplayMode;
  replayToolCalls?: RecordedReplayToolCall[];
  initialWorkspace?: Record<string, string>;
}

export async function createCopilotRequestContext({
  promptRoot,
  shift,
  evidence,
  replayMode = 'candidate',
  replayToolCalls = [],
  initialWorkspace = {},
}: CreateCopilotRequestContextInput): Promise<
  RequestContext<CopilotRequestContext>
> {
  const requestContext = new RequestContext<CopilotRequestContext>();
  const replayEvidence = evidence ?? {
    shift,
    events: [],
    copilotMessages: [],
  };
  requestContext.set(
    'copilot-system-prompt',
    await assembleCopilotSystemPrompt({ promptRoot, shift }),
  );
  requestContext.set('copilot-replay-tool-calls', replayToolCalls);
  requestContext.set('copilot-replay-mode', replayMode);
  requestContext.set('copilot-replay-evidence', replayEvidence);
  requestContext.set('copilot-virtual-workspace', {
    ...buildVirtualWorkspace(replayEvidence),
    ...initialWorkspace,
  });
  requestContext.set('copilot-tool-trace', []);
  requestContext.set('copilot-observed-tool-calls', []);

  return requestContext;
}

function buildVirtualWorkspace(
  evidence: ReplayEvidence,
): Record<string, string> {
  const workspace: Record<string, string> = {
    'context/job.json': JSON.stringify(evidence.shift, null, 2),
  };
  const guard = evidence.shift.guard;

  if (guard && typeof guard === 'object') {
    const guardRecord = guard as Record<string, unknown>;
    const guardId = guardRecord.id;
    const fileName =
      typeof guardId === 'string' || typeof guardId === 'number'
        ? String(guardId)
        : 'assigned';
    workspace[`context/guards/${fileName}.json`] = JSON.stringify(
      guardRecord,
      null,
      2,
    );
  }

  return workspace;
}
