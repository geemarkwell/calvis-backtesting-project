import { RequestContext } from '@mastra/core/request-context';
import { copilotReplayTools } from './replay-tools';
import type { CopilotRequestContext } from './types';

describe('copilot replay tools', () => {
  function createContext(mode: 'original' | 'candidate' = 'original') {
    const requestContext = new RequestContext<CopilotRequestContext>();
    requestContext.set('copilot-system-prompt', 'test prompt');
    requestContext.set('copilot-replay-mode', mode);
    requestContext.set('copilot-active-turn', 14);
    requestContext.set('copilot-active-timestamp', '2026-08-05T02:21:21Z');
    requestContext.set('copilot-replay-evidence', {
      shift: { id: 56370 },
      events: [],
      copilotMessages: [],
    });
    requestContext.set('copilot-virtual-workspace', {});
    requestContext.set('copilot-tool-trace', []);
    requestContext.set('copilot-observed-tool-calls', []);
    return requestContext;
  }

  it('returns recorded results, captures generated input, and performs no I/O', async () => {
    const requestContext = createContext();
    requestContext.set('copilot-replay-tool-calls', [
      {
        turn: 14,
        timestamp: '2026-08-05T02:21:14Z',
        tool: 'mcp__calvis__get_guard_locations',
        input: {
          session_id: 'session-1',
          job_id: 56370,
          include_pings: true,
        },
        output: { guards: [{ id: 9674 }] },
        ok: true,
      },
    ]);

    const execute = copilotReplayTools.get_guard_locations.execute;
    expect(execute).toBeDefined();

    const result = await execute!(
      {
        session_id: 'session-1',
        job_id: 56370,
        include_pings: true,
      },
      { requestContext } as never,
    );

    expect(result).toEqual({ guards: [{ id: 9674 }] });
    expect(requestContext.get('copilot-observed-tool-calls')).toEqual([
      {
        tool: 'get_guard_locations',
        input: {
          session_id: 'session-1',
          job_id: 56370,
          include_pings: true,
        },
      },
    ]);
    expect(requestContext.get('copilot-tool-trace')).toEqual([
      expect.objectContaining({
        turn: 14,
        tool: 'get_guard_locations',
        resolution: 'recorded',
      }),
    ]);
  });

  it('fails original replay when turn, tool, and input do not all match', async () => {
    const requestContext = createContext();
    requestContext.set('copilot-replay-tool-calls', []);

    await expect(
      copilotReplayTools.request_copilot_dm.execute!(
        {
          session_id: 'session-1',
          recipient_guard_id: 9674,
          body: 'Checking in.',
        },
        { requestContext } as never,
      ),
    ).rejects.toThrow(
      'No exact recorded result for turn 14, tool request_copilot_dm',
    );
  });

  it('intercepts new candidate side effects with deterministic success', async () => {
    const requestContext = createContext('candidate');
    requestContext.set('copilot-replay-tool-calls', []);

    const result = await copilotReplayTools.request_copilot_dm.execute!(
      {
        session_id: 'session-1',
        recipient_guard_id: 9674,
        body: 'Checking in.',
      },
      { requestContext } as never,
    );

    expect(result).toEqual({
      status: 'simulated_success',
      replay_only: true,
      tool: 'request_copilot_dm',
    });
    expect(requestContext.get('copilot-tool-trace')).toEqual([
      expect.objectContaining({ resolution: 'simulated_side_effect' }),
    ]);
  });

  it('returns unavailable_in_replay for unsupported candidate reads', async () => {
    const requestContext = createContext('candidate');
    requestContext.set('copilot-replay-tool-calls', []);

    const result = await copilotReplayTools.get_job_communications.execute!(
      { job_id: 56370 },
      { requestContext } as never,
    );

    expect(result).toEqual(
      expect.objectContaining({ status: 'unavailable_in_replay' }),
    );
  });
});
