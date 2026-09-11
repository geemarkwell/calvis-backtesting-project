# Automate Job/Shift Diagnosis

## Goal

Automatically run CIE Diagnose when a production job/shift ends, so users do not need to manually trigger discovery before viewing issues/backtest targets.

## Desired Flow

```text
Job/shift ends in webapp/webapp2
  -> webapp enqueues diagnosis task
  -> task calls CIE Diagnose using replaySource=production
  -> CIE loads the production replay bundle
  -> CIE runs Diagnose
  -> CIE saves diagnosis artifacts/run
  -> product UI lists diagnosis issues for the completed job
  -> user selects one issue and backtests it
```

## Important Principle

Do **not** run Diagnose inline inside the job-completion request path.

Diagnosis can be slow and model-dependent, so job completion should enqueue background work instead of blocking the user or operational workflow.

## Proposed Integration

### 1. Webapp detects job completion

When a job transitions into a completed/ended state, emit or enqueue a background task.

Example background payload:

```json
{
  "jobId": "12345",
  "reason": "job_completed",
  "requestedBy": "system",
  "diagnosisMode": "post_shift"
}
```

### 2. Webapp worker calls CIE

Initial API shape can call the existing Diagnose endpoint:

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

If webapp does not know the turn range, add a CIE convenience mode later:

```json
{
  "jobId": "12345",
  "replaySource": "production",
  "scope": "full-job",
  "useCompactContext": true
}
```

CIE would then derive first/last replay turn from the production bundle.

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

Then they can select an individual finding/pattern and run the existing one-target-at-a-time backtest flow:

```text
Selected issue
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

The automation task should be idempotent and retry-safe.

Recommended rules:

- one active diagnosis run per job/scope at a time
- safe retry on transient CIE/model/provider failures
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

1. Add a webapp background task triggered by job completion.
2. Have the task compute or fetch first/last turn.
3. Call CIE `POST /diagnose/discover` with `replaySource: "production"`.
4. Store returned run metadata in webapp DB.
5. Show completed diagnosis runs/issues in the UI.

Avoid adding auto-backtest initially. Diagnosis should only discover issues; users still choose which issue to backtest.

## Later Improvements

- Add CIE `scope: "full-job"` so webapp does not need turn ranges.
- Add diagnosis-run status endpoint for queued/running/completed/failed states.
- Store CIE diagnosis metadata in a proper DB instead of only filesystem artifacts.
- Add scheduled re-diagnosis when prompts or policy files change.
- Add sampling controls for high-volume jobs.
- Add notifications for high-severity findings.
