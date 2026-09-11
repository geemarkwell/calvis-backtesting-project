# V1 Objectives / TODO

These are practical issues we need to solve to make the v1 backtesting flow more reliable, easier to debug, and easier to read.

## 1. Handle turn selection much better

We need a better way to choose which turns are included in a backtest.

Right now, small ranges are fine:

```text
turns 1–5
```

That usually works because the replay is short, focused, and cheap.

But large ranges become brittle:

```text
turns 1–30
```

Problems with large ranges:

- more likely to timeout
- more expensive
- harder for Maya to judge cleanly
- includes lots of irrelevant noise
- easier for the backtest to fail for reasons unrelated to the issue we care about

### Goal

The pipeline should reliably capture the correct turns, and only the turns needed, for the task.

We need to figure out how to select a focused replay window automatically or semi-automatically.

Possible approach:

- start from the callout or diagnosis timestamp
- include a small window before the issue
- include the key Copilot turns and guard replies around the issue
- include only necessary supporting events: location, telemetry, job logs, tool calls
- avoid replaying the whole shift unless the issue is truly shift-wide

The user should not have to guess a huge turn range just to make sure the issue is included.

## 2. Add a retry loop when Theo fails Maya

Not urgent, but eventually we should support a loop like this:

```text
Theo proposes fix
  → replay candidate
  → Maya evaluates
  → Maya says failed
  → system diagnoses why it failed
  → Theo tries a better fix
```

For now, a manual “try again” button is okay.

Later, this should probably become automated so CIE can self-heal failed prompt attempts. The loop should still have limits so it does not run forever.

### Near-term version

Manual retry is enough:

- show why Maya failed the candidate
- let the user ask Theo to try again
- pass Theo the failed Maya result as context
- create a new candidate version
- rerun the backtest

## 3. Save proposed candidate changes even when Maya fails

When Maya fails a candidate, we should still save the instruction/prompt change Theo attempted.

This is important because failed attempts are useful evidence.

When looking at a failed backtest, we should be able to see:

- what Theo thought the problem was
- what file Theo tried to change
- the old text
- the new proposed text
- the candidate version id
- Maya's reason for failing it

This makes failures inspectable instead of mysterious.

### Goal

Failed Maya runs should still preserve the attempted candidate change as an artifact.

Suggested artifact:

```text
cie/runs/<run-id>/
  candidate-change.json
  candidate-diff.patch
  maya-verdict.json
```

## 4. Show failed Maya results in red, passed results in green

The graph/UI currently makes failed and passed Maya results look green.

That is confusing.

### Desired behavior

- passed result = green
- failed result = red
- warning/partial result = yellow or orange
- unknown/error result = gray

This matters for reading backtest progress over time. A user should be able to glance at the graph and quickly understand whether the system is improving or failing.

The color should reflect the actual Maya verdict, not just whether the run completed successfully.

## 5. Tag diagnosis fixes by candidate intervention kind

During diagnosis, the system should identify what kind of candidate intervention the suggested fix most likely requires.

Right now, CIE can drift toward treating failures as prompt problems. That is useful for prompt backtesting, but some findings clearly point to tool behavior, context/data handling, workflow/state carry-forward, safety controls, product/backend/frontend code, or even test/evaluator quality instead.

### Desired behavior

Every diagnosis should include a candidate kind tag:

```text
prompt
code
tool
context
workflow
safety
test
unknown
```

Example:

```json
{
  "diagnosis": "Copilot stayed silent because the prompt does not clearly require scheduled check-ins after long quiet periods.",
  "suggestedCandidateKind": "prompt",
  "suggestedFix": "Update the scheduled-check-in instruction to require a guard check when no report has been received for more than one wake interval."
}
```

```json
{
  "diagnosis": "The replay did not include the guard's latest message before Maya evaluated the turn.",
  "suggestedCandidateKind": "code",
  "suggestedFix": "Fix the turn-window builder so guard messages immediately before the selected Copilot turn are included in the evidence packet."
}
```

```json
{
  "diagnosis": "Live camera credentials are embedded in model-visible job instructions and diagnosis artifacts.",
  "suggestedCandidateKind": "safety",
  "suggestedFix": "Move camera credentials behind a secret broker or authenticated deep link, redact secrets from model context and artifacts, and rotate the exposed credential."
}
```

### Why this matters

- Prompt candidates can go through Theo → candidate prompt → replay → Maya.
- Tool, context, workflow, safety, code, and test candidates should not be forced into a prompt-edit flow.
- Non-prompt candidates should create manual-validation records with a concrete validation plan.
- The UI can route the user correctly: “run prompt backtest” vs “create implementation task” vs “manual safety/workflow validation.”
- It makes diagnosis output clearer and less misleading before Theo begins staged candidate planning.

For now, this can be a required field on saved diagnosis results. Later, we can add confidence, replayability, and mixed cases like `prompt + workflow` if needed.

## 6. Build a master policy from `calvis-ai` prompts

We need a master policy document for backtesting.

This should be built from the prompts in the `calvis-ai/` codebase. The goal is to capture the default rules the model should always follow, especially compliance and operational behavior.

The master policy should cover things like:

- attire / uniform expectations
- time and scheduling expectations
- check-in and check-out behavior
- how guards are meant to patrol
- report cadence and required updates
- escalation rules
- when the agent should message vs stay silent
- how the agent should talk to guards
- what evidence the agent needs before pushing back or flagging something

This should become its own `.md` file, separate from individual diagnosis notes or one-off test targets.

Suggested file:

```text
cie/docs/v1/master_policy.md
```

### Why this matters

Different diagnosis runs should be tested against the same baseline expectations. A prompt change might fix one specific issue, but it should not break core Copilot behavior.

Example:

```text
Diagnosis target: Copilot was too aggressive about patrol confirmation.
Master policy check: Copilot still needs to enforce patrol obligations, uniform rules, scheduling, and escalation rules.
```

So every backtest should answer both:

1. Did we fix the specific diagnosis?
2. Did we still follow the master policy?

### Desired flow

```text
read calvis-ai prompts
  → extract durable compliance and agent-behavior rules
  → write master_policy.md
  → use master_policy.md as a backtesting reference
  → run relevant policy checks for each diagnosis/candidate
```

The policy should be readable by humans. It should not be a giant raw prompt dump. It should be a clean summary of the rules the Copilot is expected to follow.

## 7. Regression handling and rollback

We need a clear way to handle regressions.

If a candidate change makes the agent worse, or breaks the master policy, we should be able to revert the agent back to its previous known-good state.

### Goal

Every accepted agent/prompt change should be reversible.

The system should track:

- the previous prompt/instruction version
- the new candidate version
- what changed
- which backtests passed before acceptance
- which later test or diagnosis found a regression
- who accepted or reverted the change

### Desired behavior

If a regression is found, the user should be able to choose:

```text
Revert to previous version
```

That should restore the last known-good prompt/instruction state and save a rollback record.

### Why this matters

Prompt changes can fix one issue while breaking another. We need a safe escape hatch so CIE is not only good at making changes, but also good at undoing bad ones.

Example:

```text
Candidate fixes: Copilot is less aggressive when questioning patrol reports.
Regression: Copilot now fails to enforce required patrol cadence.
Action: Revert to previous prompt version and mark the candidate as regressed.
```

### Suggested artifacts

```text
cie/runs/<run-id>/
  accepted-candidate.json
  regression-report.json
  rollback-record.json
```

The UI should make rollback status obvious:

- active version
- previous version
- reverted version
- reason for revert
- regression that triggered it

## 8. Show backtest history linked to each diagnosis

Users should be able to see the history of backtests connected to a diagnosis.

A diagnosis should not feel like a one-off note. It should become the parent record for all attempts to fix or validate that issue.

### Goal

From a diagnosis page, users should be able to see every related backtest run.

This should include:

- original diagnosis
- suggested fix / candidate kind
- each Theo candidate attempt
- each replay/backtest run
- Maya pass/fail result for each run
- candidate diff or proposed change
- whether the candidate was accepted, rejected, retried, or reverted
- timestamps and user actions

### Why this matters

When a fix fails, users need context. They should not have to search through run folders or remember which backtest belonged to which diagnosis.

Example history:

```text
Diagnosis: Copilot was too aggressive after patrol confirmation.

Attempt 1: Prompt candidate v1
  → Maya failed
  → reason: still challenged guard without enough evidence

Attempt 2: Prompt candidate v2
  → Maya passed diagnosis target
  → master policy passed
  → accepted

Later regression check
  → failed patrol enforcement policy
  → candidate reverted
```

### Desired UI behavior

Each diagnosis should have a “Backtest history” section.

The default view should show a simple timeline:

```text
diagnosed → candidate created → replayed → Maya failed → retried → Maya passed → accepted
```

Users should be able to click into each run for details, but the history view itself should stay readable and high-level.

### Data requirement

Every backtest run should store a reference back to its source diagnosis or pattern id.

Suggested fields:

```json
{
  "diagnosisId": "diag_123",
  "patternId": "pattern_456",
  "backtestRunId": "bt_789",
  "candidateVersionId": "job-56370-0.2",
  "mayaVerdict": "failed"
}
```
