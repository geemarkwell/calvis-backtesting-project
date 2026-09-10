# Moving CIE Backtests Toward Production Data

## Goal

Let the CIE backtest flow run against real Calvis production/restored Postgres data instead of only pre-exported `shifts/*.json` bundles.

Current CIE replay is file-backed:

```text
<bundleRoot>/shifts/<jobId>.json
  → CIE shift loader
  → simulate/original/backtest services
```

The production-ready path should preserve the existing CIE replay services where possible and add a narrow adapter that builds the same shift-bundle shape from Postgres/API/MCP sources.

```text
Postgres / web-app APIs / MCP tools
  → shift bundle builder
  → { shift, events, baseline }
  → existing CIE simulate/backtest path
```

## Current backtest inputs

The frontend backtest console sends a small set of parameters. These are the public knobs that should continue to work when the source becomes production data.

### Simulation / replay request

```ts
{
  jobId: string;
  startTurn: number;
  endTurn: number;
  replayMode: "original" | "candidate";
  promptVersion?: string;
  debug: boolean;
  callNiko: boolean;
  useCompactContext: boolean;
}
```

### Backtest / Maya request

```ts
{
  jobId: string;
  startTurn: number;
  endTurn: number;
  replayMode: "candidate";
  callout: string;
  expectedBehavior: string;
  baselineSource: "shift" | "simulation";
  baselineSimulationNumber?: number;
}
```

### Theo diagnosis request

```ts
{
  whatWentWrong: string;
  expectedBehavior: string;
  badResponses: Array<{
    jobId?: string;
    simTarget?: number;
    startTurn: number;
    endTurn: number;
  }>;
}
```

Frontend proxy endpoints:

- `POST /api/simulate` → CIE `POST /copilot/simulate`
- `POST /api/backtest` → CIE `POST /copilot/backtest`
- `GET /api/original` → CIE `GET /copilot/original`
- `GET /api/original-sources` → CIE `GET /copilot/original-sources`

## Current CIE shift-bundle contract

CIE currently loads one file per job:

```text
shifts/<jobId>.json
```

The required shape is:

```ts
{
  shift: {
    id: string | number;
    start: string;
    end: string;
    timezone: string;
    guard?: {
      id?: string | number;
      name?: string;
    };
  };
  events: ShiftEvent[];
  baseline: BaselineEntry[];
}
```

Minimum structural requirements:

- `shift.id`
- `shift.start`
- `shift.end`
- `shift.timezone`
- `events: []`
- `baseline: []`

### Turn boundaries

Replay turns are selected from `baseline` entries:

```ts
{
  type: "turn_start";
  ts: string;
  turn: number;
  trigger: string;
}
```

`startTurn` and `endTurn` are numbered turn indexes, not timestamps.

### Recorded tool calls

Original replay requires recorded tool calls in `baseline`:

```ts
{
  type: "tool_call";
  ts: string;
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  ok?: boolean;
  error?: string | null;
  trigger?: string;
}
```

These are normalized and associated back to the nearest turn.

### Historical copilot output

Historical copilot messages come from:

```ts
{
  type: "copilot_message";
  ts: string;
  text: string;
  trigger?: string;
}
```

Do not assume `CopilotMessage(role='system', content='Turn completed')` is an outbound guard message. That row is a lifecycle marker only.

### Guard/input events

Guard messages come from `events` entries:

```ts
{
  ts: string;
  type: "guard_message";
  text?: string;
  audio_transcription?: string;
  image?: string;
}
```

Other events may include location, telemetry, job logs, incidents, geofence transitions, audio summaries, and related shift data.

## Inspector-grade artifact expectations

`calvis-ai/evals/inspector.py` renders eval artifacts as groups → runs → wakes/ticks.

A useful production replay should preserve enough data to produce wake records like:

```json
{
  "elapsed_minutes": 42,
  "trigger": "guard_message",
  "guard_messages": [],
  "dms": [],
  "tool_calls": [],
  "assistant_text": "",
  "prompt": "",
  "notes": ""
}
```

Important fields:

- `trigger` — why the copilot woke.
- `guard_messages` — guard input visible in that wake.
- `dms` — outbound messages, derived from `request_copilot_dm` tool calls.
- `tool_calls` — full tool sequence.
- `assistant_text` — model text/reasoning captured for the wake, if available.
- `prompt` — exact prompt sent to model, if available.
- `notes` — scratchpad state, often `workspace/analysis.md`.
- `assertions` — pass/fail criteria plus evidence pointers.

`calvis-ai/evals/production_ticks.py` reconstructs this from recorded production tool calls by grouping on `turn_id`, ordering by `(date_created, sequence)`, and extracting DMs from:

```text
mcp__calvis__request_copilot_dm
```

## Existing production/API/MCP sources

There is no single existing endpoint that returns the exact CIE `ShiftBundle`, but the ingredients already exist.

### Session and copilot history

MCP/tools:

- `get_copilot_context(session_id)`
- `get_copilot_message_history(session_id, job_id, guard_id?, context_type?, hours?, limit?)`

Backed by:

- `GET /api/v2/copilot/sessions/<session_id>/`
- `GET /api/v2/copilot/past-copilot-messages/`

Useful for pending DM requests, operator messages, guard responses, and recent copilot messages.

### Job logs

MCP/tool:

- `get_job_logs(job_id, session_id?, before?, after?, category?)`

Backed by:

- `GET /api/v2/copilot/job-logs/`

Useful for check-ins, incident logs, geofence events, clock-outs, and other job activity.

### Job chat / guard messages

MCP/tool:

- `get_job_chat_messages(job_id, session_id?, before?, after?, limit?, compact?)`

Backed by:

- `GET /api/v2/copilot/chat-messages/`

Useful for guard messages, copilot DMs, and room-level chat history.

### Incidents

MCP/tool:

- `get_job_incidents(job_id, session_id?, guard_id?)`

Backed by:

- `GET /api/v2/copilot/job-incidents/`

Useful for draft/submitted/reviewed/closed incidents.

### Guard location and telemetry

MCP/tools:

- `get_guard_locations(job_id, session_id?, guard_id?, after?, include_pings?, max_pings?)`
- `get_guard_activity(job_id, guard_id, since?, until?, session_id?)`

Backed by:

- `GET /api/v2/copilot/guard-locations/`
- `GET /api/v2/copilot/guard-activity/`

Useful for movement, battery, pings, geofence state, and activity windows.

### Site history

MCP/tool:

- `get_site_history(job_id, days?, session_id?)`

Backed by:

- `GET /api/v2/copilot/site-history/`

Useful for prior incidents, historical flags, returning guards, and open action items.

### Job communications

MCP/tool:

- `get_job_communications(job_id, hours?, limit?, since?, until?, include_timeline?)`

Backed by:

- `GET /api/v2/comms/job/`

Useful for broader guard/client/agency/admin outreach timeline and per-party rollups.

### Production tool-call stream

Backend endpoint:

- `POST /api/v2/copilot/tool-calls/record/`

Model:

- `CopilotToolCall`

Important fields:

```py
session
job_id
turn_id
sequence
tool_name
tool_input
tool_output
ok
error
duration_ms
recipient_guard_id
trigger
date_created
```

This is the closest production source for inspector-style replay because it can reconstruct per-turn tool calls and outbound DMs.

## Main production gap

Existing APIs/MCP tools can supply most raw information, but CIE currently expects a prebuilt bundle file:

```ts
{
  shift,
  events,
  baseline
}
```

The missing production bridge is a DB-backed shift-bundle builder that emits this exact shape from Postgres.

## Proposed adapter

Add a production bundle builder with this responsibility only:

```text
job/session id + turn window
  → query production/restored DB and APIs
  → normalize into ShiftBundle
  → hand to existing CIE episode/replay services
```

The builder should output:

```ts
{
  shift: { id, start, end, timezone, guard, account/job metadata },
  events: [guard_message, job_log, location, telemetry, incident, ...],
  baseline: [turn_start, tool_call, copilot_message]
}
```

### Suggested source mapping

| ShiftBundle field | Production source |
| --- | --- |
| `shift` | `Job`, assigned guards, account/site fields |
| `events.guard_message` | `ChatMessage`, audio transcription/image fields if present |
| `events.job_log` | `JobLog` |
| `events.incident` | `JobIncident`, incident API output |
| `events.location/telemetry` | guard location / telemetry tables or existing `guard-locations` APIs |
| `baseline.turn_start` | grouped copilot turns from `CopilotToolCall.turn_id`, `CopilotMessage.turn`, timestamps/triggers |
| `baseline.tool_call` | `CopilotToolCall` rows ordered by `(date_created, sequence)` |
| `baseline.copilot_message` | prefer `request_copilot_dm` tool input / `CopilotDMRequest` / resulting `ChatMessage`; use `CopilotMessage` only when it contains real outbound text |

## Risks / details to get right

### 1. Turn boundaries

CIE requires numbered turns. Production rows may have UUID-like `turn_id`, nullable turn fields, and lifecycle messages. The adapter must deterministically map production turns to `1..N` in chronological order.

### 2. Outbound messages

Do not treat `Turn completed` as a copilot DM. The reliable outbound signal is:

- `CopilotToolCall.tool_name = mcp__calvis__request_copilot_dm` or `request_copilot_dm`
- linked/completed `CopilotDMRequest`
- resulting guard-facing `ChatMessage`

### 3. Prompt and assistant text

Production may not always have the exact prompt or full assistant text. The inspector can tolerate missing `prompt` / `assistant_text`, but high-quality diffs are much better when these are captured.

### 4. Time-window semantics

Existing MCP tools are backtest-aware via `session_id`, but file replay is static timestamp replay. The production builder must preserve simulated-time behavior consistently.

### 5. Sensitive/redacted tool payloads

Some tool inputs/outputs are sensitive or capped/truncated. Preserve the call record and mark redaction rather than silently dropping it.

## Recommended implementation sequence

1. Add a read-only `ShiftBundleBuilder` interface in CIE.
2. Keep the current file-backed implementation as the default.
3. Add a Postgres/API-backed implementation that returns the same `ShiftBundle` contract.
4. Add a source selector:

   ```ts
   source: "file" | "production"
   ```

   or infer production mode when no `shifts/<jobId>.json` exists.

5. Validate bundle parity by comparing:
   - turn count
   - tool call count
   - outbound DM count
   - guard message count
   - selected `startTurn/endTurn` windows
6. Only then wire the frontend to expose production-backed jobs.

## Bottom line

The production migration should not rewrite CIE replay. The safest path is an adapter that converts real Calvis data into the same bundle CIE already knows how to replay.

Existing APIs and MCP tools cover most of the needed raw data. The missing piece is a deterministic builder that turns DB/session/job history into:

```ts
{ shift, events, baseline }
```

Once that exists, the current simulation, Theo, Maya, and inspector flows can run against restored or live production data with minimal disruption.
