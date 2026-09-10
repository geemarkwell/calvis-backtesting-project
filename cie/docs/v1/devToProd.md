# CIE Dev-to-Prod Backtest Source Plan

## Goal

Move CIE from temporary prebuilt `shifts/*.json` bundles toward production/restored Calvis data without breaking the existing backtester.

The backtester should continue to operate on the same normalized replay contract:

```ts
{ shift, events, baseline }
```

The only change is where that contract comes from.

```text
Current dev path:
shifts/<jobId>.json
  → ShiftBundle
  → existing CIE replay/backtest

Production path:
prod/restored DB + web-app APIs/MCP tools
  → ProductionShiftBundleBuilder
  → same ShiftBundle
  → existing CIE replay/backtest
```

## Principle

Do **not** rewrite the replay engine, Theo, Maya, or inspector flow.

Add a source adapter that can produce the same bundle shape from production elements. Keep the file-backed source as a safe default until production parity is proven.

## Source selector

Add a backtest source selector as a UI toggle/dropdown.

Suggested UI label:

```text
Replay source
[ File bundle ] [ Production data ]
```

Suggested request field:

```ts
source?: "file" | "production";
```

Initial default:

```ts
source: "file"
```

This keeps existing behavior unchanged.

## Current file-backed source

CIE currently loads:

```text
<bundleRoot>/shifts/<jobId>.json
```

through the existing shift loader and expects:

```ts
interface ShiftBundle {
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

This path should remain available for:

- local fixtures
- regression tests
- parity checks
- debugging
- backtest demos without DB/API dependencies

## New production-backed source

Add a production source that builds the same `ShiftBundle` from real data.

Conceptually:

```ts
interface ShiftBundleSource {
  load(jobId: string | number): Promise<{ jobId: string; bundle: ShiftBundle }>;
}
```

Implementations:

```text
FileShiftBundleSource
ProductionShiftBundleSource
```

Source selection:

```ts
function resolveShiftBundleSource(source: "file" | "production") {
  if (source === "production") return new ProductionShiftBundleSource();
  return new FileShiftBundleSource();
}
```

## Production data mapping

The production builder should normalize DB/API data into the existing fields.

| ShiftBundle field | Production source |
| --- | --- |
| `shift.id` | `Job.id` |
| `shift.start` | `Job.job_start` |
| `shift.end` | `Job.job_end` |
| `shift.timezone` | job/account/site timezone resolver |
| `shift.guard` | assigned/requested guard rows |
| `events.guard_message` | `ChatMessage`, audio transcription/image fields where available |
| `events.job_log` | `JobLog` |
| `events.incident` | `JobIncident` / job incidents API |
| `events.location` | guard location/ping tables or guard-location API |
| `events.telemetry` | guard/device telemetry tables or guard-activity API |
| `baseline.turn_start` | grouped copilot turns from session/tool/message data |
| `baseline.tool_call` | `CopilotToolCall` rows ordered by `(date_created, sequence)` |
| `baseline.copilot_message` | outbound DM/action evidence from `request_copilot_dm`, `CopilotDMRequest`, and resulting `ChatMessage` |

## Existing APIs/MCPs that can provide ingredients

The production source can use direct DB queries, web-app APIs, MCP tools, or a mix. Existing tools already expose most required information.

### Session and copilot context

- MCP: `get_copilot_context(session_id)`
- MCP: `get_copilot_message_history(session_id, job_id, guard_id?, context_type?, hours?, limit?)`
- API: `GET /api/v2/copilot/sessions/<session_id>/`
- API: `GET /api/v2/copilot/past-copilot-messages/`

### Job logs

- MCP: `get_job_logs(job_id, session_id?, before?, after?, category?)`
- API: `GET /api/v2/copilot/job-logs/`

### Job chat and guard messages

- MCP: `get_job_chat_messages(job_id, session_id?, before?, after?, limit?, compact?)`
- API: `GET /api/v2/copilot/chat-messages/`

### Incidents

- MCP: `get_job_incidents(job_id, session_id?, guard_id?)`
- API: `GET /api/v2/copilot/job-incidents/`

### Guard location and telemetry

- MCP: `get_guard_locations(job_id, session_id?, guard_id?, after?, include_pings?, max_pings?)`
- MCP: `get_guard_activity(job_id, guard_id, since?, until?, session_id?)`
- API: `GET /api/v2/copilot/guard-locations/`
- API: `GET /api/v2/copilot/guard-activity/`

### Site history

- MCP: `get_site_history(job_id, days?, session_id?)`
- API: `GET /api/v2/copilot/site-history/`

### Job communications

- MCP: `get_job_communications(job_id, hours?, limit?, since?, until?, include_timeline?)`
- API: `GET /api/v2/comms/job/`

### Copilot tool calls

- Model: `CopilotToolCall`
- API ingest: `POST /api/v2/copilot/tool-calls/record/`

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

This is the best source for reconstructing original tool behavior and outbound DM intent.

## UI behavior

The UI source toggle should affect all replay-style actions:

- original replay
- candidate replay
- backtest
- source listing, if applicable
- diagnosis/evaluation flows that load replay windows

Suggested form state addition:

```ts
interface BacktestFormState {
  source: "file" | "production";
  // existing fields...
}
```

Suggested API request addition:

```ts
interface SimulationRequest {
  source?: "file" | "production";
}

interface BacktestRequest extends SimulationRequest {
  baselineSource: "shift" | "simulation";
}
```

Compatibility rule:

- missing `source` means `file`
- `file` keeps current behavior
- `production` uses production source adapter

## Backend/CIE behavior

CIE service flow should stay mostly unchanged.

Current:

```ts
const { jobId, bundle } = await loadShiftBundle(bundleRoot, input.jobId);
```

Target:

```ts
const { jobId, bundle } = await shiftBundleSource.load(input.jobId);
```

Everything downstream should continue to consume the same `bundle`.

## Turn construction rules

The production source must produce deterministic `baseline.turn_start` entries.

CIE expects:

```ts
{
  type: "turn_start",
  ts: string,
  turn: number,
  trigger: string
}
```

Production may have:

- `CopilotToolCall.turn_id`
- `CopilotToolCall.trigger`
- `CopilotMessage.turn`
- session timestamps
- lifecycle markers

Recommended rule:

1. Group rows by stable production turn id when available.
2. Order turn groups by first event/tool/message timestamp.
3. Assign numeric `turn` values starting at `1`.
4. Use the earliest known trigger in the group.
5. If trigger is absent, use `unknown` rather than guessing.

## Outbound message rules

Do not treat lifecycle rows as guard-facing messages.

Specifically, this is **not** a copilot DM:

```text
role: system
content: Turn completed
```

Reliable outbound message evidence should come from:

- `CopilotToolCall.tool_name = mcp__calvis__request_copilot_dm`
- `CopilotToolCall.tool_name = request_copilot_dm`
- linked/completed `CopilotDMRequest`
- resulting guard-facing `ChatMessage`

These should become `baseline.copilot_message` and/or inspector `dms[]` records.

## Backwards compatibility requirements

To avoid breaking the current backtester:

1. Keep `source` optional.
2. Default missing `source` to `file`.
3. Do not remove `shifts/*.json` support.
4. Do not change the existing `ShiftBundle` contract.
5. Do not change existing response shapes unless the change is additive.
6. Do not make production DB/API access required for file-backed tests.
7. Gate production source behind the UI toggle and/or env flag until validated.

## Validation plan

Use jobs where both a prebuilt shift JSON and restored/prod data exist.

For each job, compare file source vs production source:

- shift start/end/timezone
- selected turn count
- turn order
- turn timestamps
- turn triggers
- guard message count
- tool call count
- outbound DM count
- `request_copilot_dm` bodies
- incidents/logs/messages included in the selected window
- original replay output

A mismatch does not necessarily mean production source is wrong, but it must be explainable.

## Rollout sequence

1. Add `source?: "file" | "production"` to request types.
2. Default to `file` everywhere.
3. Add a `ShiftBundleSource` abstraction.
4. Wrap the existing loader as `FileShiftBundleSource`.
5. Add `ProductionShiftBundleSource` behind a flag.
6. Add parity tests using known jobs.
7. Add the frontend source toggle.
8. Keep toggle defaulted to file until parity is acceptable.
9. Switch local/dev default to production only after confidence is high.
10. Leave file mode available permanently for fixtures/regressions.

## Main risks

### Turn numbering drift

Severity: high.

If production turns are grouped differently from old JSON turns, `startTurn/endTurn` windows may select different behavior.

Mitigation: deterministic grouping, parity tests, and clear turn previews in UI.

### False outbound messages

Severity: high.

If lifecycle markers like `Turn completed` are treated as DMs, evaluations will be wrong.

Mitigation: outbound messages must come from DM tool calls, DM requests, or resulting chat messages.

### Missing prompts or assistant text

Severity: medium.

Production may not always have exact prompt/assistant text.

Mitigation: make these optional; inspector already supports missing fields.

### Redacted/truncated tool payloads

Severity: medium.

Some tool inputs/outputs may be sensitive or capped.

Mitigation: preserve the tool-call record with redaction markers rather than dropping it.

### UI confusion

Severity: medium.

Users may not understand why file and production source differ.

Mitigation: show the selected source clearly and label production as real DB/API data.

## Desired final UX

A user opens the backtest console, enters a job and turn window, then chooses:

```text
Replay source: Production data
```

The rest of the UI works the same:

- original replay loads
- candidate replay runs
- Theo diagnoses
- Maya judges
- inspector/evidence surfaces show wakes/tool calls/DMs

The source selector changes only the data adapter, not the backtest workflow.

## Bottom line

The clean dev-to-prod path is additive:

```text
Add source selector + production bundle adapter.
Keep existing file bundle path.
Keep CIE replay contract unchanged.
```

That allows CIE to use real production/restored data without breaking the current backtester or invalidating existing shift JSON fixtures.
