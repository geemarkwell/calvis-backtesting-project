# Automate Job/Shift Diagnosis

## Goal

Automatically run CIE Diagnose on recently completed production jobs/shifts on a twice-daily schedule, so users do not need to manually trigger discovery before viewing issues/backtest targets.

## Desired Flow

```text
Twice-daily scheduled diagnosis job starts
  -> webapp finds recently completed jobs/shifts without a completed diagnosis
  -> task calls CIE Diagnose using replaySource=production for each eligible job
  -> CIE loads the production replay bundle
  -> CIE runs Diagnose
  -> CIE saves diagnosis artifacts/run
  -> webapp stores diagnosis metadata/findings
  -> product UI lists diagnosis issues for completed jobs
  -> user selects one issue and backtests it
```

## Important Principle

Do **not** run Diagnose inline inside the job-completion request path.

Diagnosis can be slow and model-dependent, so job completion should never block the user or operational workflow. A twice-daily scheduled job is sufficient for the first production version and avoids the complexity of per-shift wakeups or frequent polling.

## Proposed Integration

### 1. Twice-daily scheduled diagnosis sweep

Run a scheduled webapp task twice per day, for example once in the morning and once in the evening. The task should find completed/ended jobs that are eligible for diagnosis and do not already have a completed or active diagnosis run.

Example sweep parameters:

```json
{
  "reason": "scheduled_twice_daily_sweep",
  "requestedBy": "system",
  "diagnosisMode": "post_shift",
  "lookbackHours": 24,
  "maxJobsPerRun": 25
}
```

Eligibility rules should include:

- job/shift has ended
- job has real copilot activity or a production replay bundle
- no active diagnosis run already exists for the same job/scope
- no completed diagnosis run already exists for the same job/scope/version

### 2. Scheduled worker calls CIE

For each eligible job in the bounded batch, the scheduled worker can call the existing Diagnose endpoint:

```http
POST /diagnose/discover
Content-Type: application/json
```

```json
{
  "jobId": "12345",
  "startTurn": 1,
  "endTurn": 12,
  "replaySource": "production",
  "useCompactContext": true
}
```

For a twice-daily sweep, webapp should not need to know exact turn ranges. Use CIE full-job mode:

```json
{
  "jobId": "12345",
  "replaySource": "production",
  "scope": "full-job",
  "useCompactContext": true
}
```

CIE derives first/last replay turn from the production bundle. Manual `startTurn`/`endTurn` remains available for debugging by using `scope: "turn-window"` or by sending the legacy bounded request shape.

### 3. CIE runs Diagnose

CIE should:

- load the production replay bundle for the job
- compile compact Diagnose evidence
- include production-backed message evidence
- run all default Diagnose lenses
- save diagnosis artifacts under `cie/runs/<diagnose-run-id>/`
- return structured metadata to webapp

Example response metadata webapp should store:

```json
{
  "runId": "diagnose-20260911143353579-2fa3a16e",
  "jobId": "12345",
  "startTurn": 1,
  "endTurn": 12,
  "summary": "Found 4 specialized LLM findings and 1 deterministic signal.",
  "issueCount": 5,
  "artifactDirectory": "cie/runs/diagnose-...",
  "status": "completed"
}
```

## Product UI Behavior

Users should be able to open a completed job and see:

```text
Diagnosis status: completed
Issues found: 5
Highest severity: high
Latest diagnosis run: diagnose-...
```

Then they can select an individual finding/pattern and run the existing one-target-at-a-time backtest flow. Diagnose scans the full job, but each finding carries a smaller evidence-derived `replayWindow`; backtest should default to that window instead of replaying the whole diagnosis window.

```text
Selected issue
  -> use finding replayWindow
  -> Theo candidate
  -> prompt replay if replayable
  -> Maya judgment
  -> manual validation if non-prompt
```

## Persistence Options

Current CIE persists diagnosis runs to local filesystem artifacts:

```text
cie/runs/<diagnose-run-id>/diagnosis.json
cie/runs/<diagnose-run-id>/evidence-packet.json
cie/runs/<diagnose-run-id>/trace-window.json
```

For production, webapp should also persist queryable metadata, such as:

```text
job_id
run_id
status
started_at
completed_at
issue_count
highest_severity
summary
artifact_location
error_code
error_message
```

This avoids scanning artifact files every time the UI loads.

## Failure Handling

The twice-daily sweep should be idempotent and retry-safe.

Recommended rules:

- one active diagnosis run per job/scope at a time
- bounded batch size per sweep so a large shift volume cannot overload CIE/model providers
- safe retry on transient CIE/model/provider failures
- failed jobs can be retried by the next scheduled sweep after a cooldown
- store failed status if Diagnose fails after retries
- expose failure message in internal/admin UI
- do not block job completion if diagnosis fails

Example failed metadata:

```json
{
  "jobId": "12345",
  "status": "failed",
  "phase": "diagnose",
  "code": "CIE_DIAGNOSE_FAILED",
  "message": "Diagnose model call failed after retries."
}
```

## Security / Access

CIE production replay access already depends on production API credentials. For automated diagnosis:

- webapp should call CIE with an internal service token
- CIE should authenticate internal automation requests
- sensitive provider/model errors should remain redacted
- diagnosis artifacts should not expose raw secrets or private headers

## Recommended First Version

Start with the smallest reliable implementation:

1. Add a webapp scheduled task that runs twice per day.
2. Have the task find recently completed jobs without an active/completed diagnosis run.
3. Have the task compute/fetch first/last turn, or call CIE with `scope: "full-job"` once available.
4. Call CIE `POST /diagnose/discover` with `replaySource: "production"`.
5. Store returned run metadata in webapp DB.
6. Show completed diagnosis runs/issues in the UI.

Avoid adding auto-backtest initially. Diagnosis should only discover issues; users still choose which issue to backtest.

## Later Improvements

- Add diagnosis-run status endpoint for queued/running/completed/failed states.
- Store CIE diagnosis metadata in a proper DB instead of only filesystem artifacts.
- Add scheduled re-diagnosis when prompts or policy files change.
- Add sampling controls for high-volume jobs.
- Add optional event-based enqueueing later if faster-than-twice-daily diagnosis becomes necessary.
- Add notifications for high-severity findings.
