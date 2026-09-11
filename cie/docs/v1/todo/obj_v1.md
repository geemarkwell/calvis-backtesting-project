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

## 5. Tag diagnosis fixes as `Code` or `Prompt`

During diagnosis, the system should identify whether the suggested fix is likely a code change or a prompt change.

Right now, CIE mostly assumes the fix belongs in the prompt system. That is useful for prompt backtesting, but some failures may clearly point to product/backend/frontend code instead.

### Desired behavior

Every diagnosis should include a fix type tag:

```text
Code
```

or

```text
Prompt
```

Example:

```json
{
  "diagnosis": "Copilot stayed silent because the prompt does not clearly require scheduled check-ins after long quiet periods.",
  "suggestedFixType": "Prompt",
  "suggestedFix": "Update the scheduled-check-in instruction to require a guard check when no report has been received for more than one wake interval."
}
```

```json
{
  "diagnosis": "The replay did not include the guard's latest message before Maya evaluated the turn.",
  "suggestedFixType": "Code",
  "suggestedFix": "Fix the turn-window builder so guard messages immediately before the selected Copilot turn are included in the evidence packet."
}
```

### Why this matters

- Prompt fixes can go through Theo → candidate prompt → replay → Maya.
- Code fixes should not be forced into a prompt-edit flow.
- The UI can route the user correctly: “start prompt improvement” vs “create engineering task.”
- It makes diagnosis output clearer and less misleading.

For now, this can be a simple required field on saved diagnosis results. Later, we can add confidence and allow mixed cases like `Prompt + Code` if needed.
