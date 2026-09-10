# Shifts JSON schema

The files in `shifts/*.json` are replay bundles for Copilot backtesting. They are built from `web-app` shift/job data, but they are not Django fixtures. Each file contains the static shift context, the time-ordered event stream, and the historical Copilot trace.

```json
{
  "shift": { },
  "events": [],
  "baseline": []
}
```

## Top-level fields

| Field | Type | Purpose |
|---|---:|---|
| `shift` | object | Static context injected when the Copilot session starts. |
| `events` | array | Time-ordered record of what happened around the guard during the shift. |
| `baseline` | array | What the real Copilot did during the historical shift: turns, tool calls, messages, errors. |

## `shift`

| Field | Type | Purpose / source |
|---|---:|---|
| `id` | string | Job/shift id. Corresponds to `web-app` `Job.id`. |
| `start` | ISO datetime | Shift start in UTC. Corresponds to `Job.job_start`. |
| `end` | ISO datetime | Shift end in UTC. Corresponds to `Job.job_end`. |
| `timezone` | string | IANA timezone name, e.g. `America/New_York`. Corresponds to `Job.tz_name`. |
| `duration_hours` | number | Computed shift length. |
| `site` | object | Site/account/location context. |
| `instructions` | object | Guard instructions and structured instruction hints. |
| `guard` | object | Assigned guard context and historical notes. |
| `account_summary` | string \| null | Account-level summary when available. Usually null in this bundle. |
| `site_notes` | array | Recent/historical notes about this site/account. |
| `wake_interval_minutes` | number | Scheduled Copilot wake cadence, usually `30`. |

## `shift.site`

| Field | Type | Purpose / source |
|---|---:|---|
| `account` | string | Account/customer name. Roughly maps to `Job.account`. |
| `address` | string | Job/site address. Maps to `Job.location` / address fields. |
| `lat` | number | Site center latitude. Maps to `Job.latitude`. |
| `lng` | number | Site center longitude. Maps to `Job.longitude`. |
| `geofence_radius_m` | number | Circular geofence radius in meters. Maps to `Job.geo_fence_radius`. |
| `check_in_geofence` | array \| null | Optional polygon used to decide if check-in is allowed. Shape: `[{"lat": number, "lng": number}]`. |
| `monitoring_geofence` | array \| null | Optional polygon used to monitor whether the guard is on-site during the shift. Same point-array shape. |

## `shift.instructions`

| Field | Type | Purpose |
|---|---:|---|
| `content` | string | Full prose instructions for the guard and Copilot. |
| `summary` | string | Short summary when available. |
| `patrol_frequency_minutes` | number \| null | Structured patrol cadence. Null means infer from prose. |
| `report_frequency_minutes` | number \| null | Structured reporting/check-in cadence. Null means infer from prose. |
| `position_type` | string \| null | Structured post type, e.g. patrol, standing post, front desk. |
| `uniform` | string \| null | Structured uniform requirement when available. |
| `parking` | string | Parking instructions. |
| `venue_type` | string | Site/venue type when available. |

In `web-app`, these fields come from job instructions / instruction templates and related structured metadata.

## `shift.guard`

| Field | Type | Purpose |
|---|---:|---|
| `name` | string | Anonymized guard name. |
| `prior_shifts_for_account` | number | Count of prior shifts this guard worked for the same account/site. |
| `prior_shifts_total` | number | Count of prior shifts overall in the relevant dataset/business context. |
| `copilot_summary` | string \| null | Prior Copilot summary about this guard, if available. |
| `notes` | array | Historical notes about guard behavior or previous shifts. |

### Note object

Used by both `shift.guard.notes` and `shift.site_notes`.

| Field | Type | Purpose |
|---|---:|---|
| `type` | string | Note type. Usually `note`. |
| `written` | ISO datetime | When the note was written. |
| `content` | string | Note text. |

## `events`

`events` is a time-ordered stream. Every event has:

| Field | Type | Purpose |
|---|---:|---|
| `ts` | ISO datetime | Event timestamp in UTC. |
| `type` | string | Event kind: `job_log`, `location`, `telemetry`, or `guard_message`. |

### Event: `job_log`

Corresponds to `web-app` `JobLog`.

```json
{
  "ts": "2026-07-01T04:00:00+00:00",
  "type": "job_log",
  "category": "checked in",
  "notes": null
}
```

| Field | Type | Purpose / source |
|---|---:|---|
| `category` | string | Operational event category. Maps to `JobLog.category`. |
| `notes` | string \| null | Extra event text. Maps to `JobLog.notes`. |

Seen categories include: `confirmed`, `in transit`, `checked in`, `checked out`, `entered geofence`, `exited geofence`, `instructions acknowledged`, `uniform photo submitted`, `uniform check passed`, `uniform check failed`, `app terminated`, `app unterminated`, and `edited shift`.

### Event: `location`

Corresponds to `web-app` `AssetLocation`.

```json
{
  "ts": "2026-07-01T02:22:55.789948+00:00",
  "type": "location",
  "lat": 39.595596,
  "lng": -74.923588,
  "accuracy_m": 3.794,
  "speed": 31.8,
  "heading": null
}
```

| Field | Type | Purpose / source |
|---|---:|---|
| `lat` | number | Guard GPS latitude. Maps to `AssetLocation.latitude`. |
| `lng` | number | Guard GPS longitude. Maps to `AssetLocation.longitude`. |
| `accuracy_m` | number | GPS accuracy in meters. Maps to `AssetLocation.accuracy`. |
| `speed` | number \| null | Device speed, likely meters/second. Maps to `AssetLocation.speed`. |
| `heading` | number \| null | Direction/bearing if known. Related to course/heading fields. |

### Event: `telemetry`

Corresponds mostly to `web-app` `HeartbeatScan`.

```json
{
  "ts": "2026-07-01T02:22:56.025479+00:00",
  "type": "telemetry",
  "battery": 1.0,
  "battery_state": "full",
  "motion": "unknown",
  "steps": 0,
  "distance_m": "0.000000",
  "altitude": "0.000000",
  "signal": 0
}
```

| Field | Type | Purpose / source |
|---|---:|---|
| `battery` | number \| null | Battery level from `0.0` to `1.0`. Maps to `HeartbeatScan.battery_level`. |
| `battery_state` | string \| null | Charging state, e.g. `full`, `charging`, `unplugged`. Maps to `HeartbeatScan.battery_state`. |
| `motion` | string \| null | Device motion classification, e.g. `automotive`, `walking`, `stationary`, `cycling`, `unknown`. Maps to `HeartbeatScan.motion_state`. |
| `steps` | number \| null | Pedometer step count. Maps to `HeartbeatScan.pedometer_step_count`. |
| `distance_m` | string \| number \| null | Pedometer distance in meters. Maps to `HeartbeatScan.pedometer_distance`. |
| `altitude` | string \| number \| null | Device/barometer altitude. Maps to heartbeat altitude/barometer fields. |
| `signal` | number \| null | Network signal strength. Maps to `HeartbeatScan.network_signal_strength`. |

### Event: `guard_message`

Corresponds to `web-app` `ChatMessage` rows sent by the guard.

```json
{
  "ts": "2026-07-01T05:00:00+00:00",
  "type": "guard_message",
  "text": "All clear",
  "image": "[photo]",
  "audio_transcription": null
}
```

| Field | Type | Purpose / source |
|---|---:|---|
| `text` | string \| null | Text the guard sent. Maps to `ChatMessage.text_content`. |
| `image` | string \| null | Image placeholder or URL. In this bundle, removed photos are represented as `[photo]`. Maps to `ChatMessage.image_url`. |
| `audio_transcription` | string \| null | Transcribed audio if the guard sent an audio message. Maps to `ChatMessage.transcription`. |

## `baseline`

`baseline` is the historical Copilot trace: what the real Copilot did on the shift. It is used as the old behavior when comparing prompt candidates.

Common fields:

| Field | Type | Purpose |
|---|---:|---|
| `ts` | ISO datetime | Trace timestamp. |
| `type` | string | Trace row type, commonly `turn_start`, `tool_call`, or `copilot_message`. |
| `trigger` | string \| null | Why Copilot woke. |
| `turn` | number \| null | Copilot turn number. |
| `text` | string | Present on `copilot_message`; message Copilot sent. |
| `tool` | string | Present on `tool_call`; tool name. |
| `input` | object | Tool input payload. |
| `output` | string \| object | Recorded tool output. |
| `ok` | boolean | Whether a tool call succeeded. |
| `error` | string \| null | Tool error if one occurred. |
| `duration_ms` | number | Tool/action runtime in milliseconds. |

Seen `trigger` values:

- `session_start`
- `guard_in_transit`
- `guard_checked_in`
- `guard_message`
- `job_event`
- `scheduled_check_in`
- `shift_ending`

Seen tool names include:

- `Read`
- `Write`
- `Glob`
- `mcp__calvis__get_copilot_message_history`
- `mcp__calvis__get_site_history`
- `mcp__calvis__get_copilot_context`
- `mcp__calvis__get_job_logs`
- `mcp__calvis__get_job_chat_messages`
- `mcp__calvis__request_copilot_dm`
- `mcp__calvis__escalate_to_ops`

## How this maps back to `web-app`

| Shift JSON area | Main `web-app` model/source |
|---|---|
| `shift.id`, `start`, `end`, `timezone`, `site.*` | `Job` |
| `shift.instructions.*` | Job instructions / `InstructionTemplate`-related data |
| `events[type=job_log]` | `JobLog` |
| `events[type=location]` | `AssetLocation` |
| `events[type=telemetry]` | `HeartbeatScan` |
| `events[type=guard_message]` | `ChatMessage` |
| `baseline` | Copilot execution trace/tool-call replay artifact |

## Notes

- The data is anonymized. Names, account names, addresses, phone numbers, and coordinates are stand-ins.
- Photos are removed. `[photo]` indicates an image existed historically.
- `events` keeps real non-chat facts fixed during replay. If a prompt change causes the conversation to diverge, the simulator can adapt guard replies while leaving location, telemetry, job logs, and timings unchanged.
