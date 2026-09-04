# Theo: Prompt Diagnostician Plan

## Agent Identity

- **Name:** Theo
- **Role:** Prompt Diagnostician
- **Code identifier:** `theoAgent`

Theo uses a historical Copilot trace to identify the most likely prompt-level cause of a reported behavior and propose one minimal, testable prompt edit.

## Objective

Given a structured problem report, one or more job/turn response windows, the expected behavior, and the Calvis prompt system, Theo will:

1. Load only the user-selected response windows demonstrating the problem.
2. Describe the observed failure using concrete evidence.
3. Identify the prompt instruction most likely responsible for causing or failing to prevent the behavior.
4. Explain the causal hypothesis.
5. Propose one minimal prompt edit for the Backtest Runner to test.

Theo does not determine whether the edit worked. The Backtest Runner executes the candidate prompt, and the Judge returns the final verdict.

## Position in the Backtesting Workflow

```text
Callout
   ↓
Theo
├── Locates the relevant episode
├── Diagnoses the prompt-level cause
└── Proposes one prompt edit
   ↓
Backtest Runner
├── Replays the original prompt
└── Replays the candidate prompt
   ↓
Judge
└── Determines whether the callout was fixed
```

## Scope

### In Scope

- Accept what went wrong and the expected behavior as separate fields.
- Accept one or more bad-response references containing a job ID and inclusive start/end turns.
- Analyze bounded historical traces from one or more jobs.
- Map problematic turns to trigger-specific instruction files.
- Inspect relevant shared core prompt files.
- Produce one evidence-backed diagnosis.
- Propose one minimal edit to one mutable prompt file.
- Report confidence, risks, and uncertainties.

### Out of Scope

- Generating callouts.
- Replaying the Copilot.
- Simulating guard responses.
- Judging whether the candidate fixed the callout.
- Modifying original prompt files directly.
- Producing multiple candidate versions.
- Repeating diagnosis until an edit passes.
- Building a general evaluation platform.
- Diagnosing application code, tool implementations, or the deliberation gate.

## Inputs

### 1. Structured Problem Report

```json
{
  "whatWentWrong": "The Copilot pushed back repeatedly after a completed patrol and flagged the guard.",
  "badResponses": [
    {
      "jobId": "56370",
      "startTurn": 9,
      "endTurn": 16
    }
  ],
  "expectedBehavior": "Acknowledge a credible completion report unless stronger evidence contradicts it."
}
```

Each response reference supplies its own job ID and inclusive turn range. A request may contain multiple windows from one job or across jobs.

### 2. Shift Context

The `shift` section of the matching JSON fixture:

- Job and site information
- Guard information
- Shift schedule
- Client instructions
- Existing site and guard notes

### 3. Bounded Historical Traces

A chronological view for each requested turn window created by merging relevant entries from `events` and `baseline`.

The trace may include:

- Guard messages
- Job events
- `turn_start` entries
- Wake triggers
- Copilot messages
- Tool calls and results
- Flags
- Alerts
- Notes
- Escalations
- Wakes that ended in silence

Raw location and telemetry rows should be excluded unless the reported problem or expected behavior concerns location, movement, connectivity, or device state.

### 4. Prompt System

Theo receives the complete mutable prompt surface:

```text
prompts/core/*
prompts/instructions/*
```

Theo also receives the trigger-to-instruction mapping defined in `prompts/PROMPTS.md`.

Only files under `core/` and `instructions/` may be proposed for modification.

## Deterministic Preprocessing

Application code should prepare the evidence before invoking Theo.

### Steps

1. Validate every job ID and inclusive turn range supplied by the user.
2. Load each distinct `shifts/<job-id>.json` fixture once.
3. Select only turns within each requested range and their linked guard messages, Copilot responses, and actions.
4. Assign every retained entry a job-qualified stable reference.
5. Merge relevant `events` and `baseline` entries chronologically within each window.
6. Preserve each entry’s:
   - Original source
   - Original index
   - Timestamp
   - Type
   - Trigger
   - Content
7. Associate every Copilot action with its preceding `turn_start`.
8. Attach the trigger-specific instruction filename to each Copilot turn.
9. Identify wakes that produced no message or relevant action as possible silence decisions.
10. Supply prompt files with stable filenames and unchanged contents.

Example normalized trace step:

```json
{
  "ref": "job:56370:baseline:143",
  "timestamp": "2026-01-01T03:14:00-06:00",
  "type": "copilot_message",
  "turn_ref": "job:56370:baseline:141",
  "trigger": "guard_message",
  "instruction_file": "instructions/guard_response.md",
  "content": "..."
}
```

This preprocessing should be ordinary application code, not another agent.

## Diagnostic Workflow

### Step 1: Interpret the Callout

Theo reads:

- Reported behavior from `whatWentWrong`
- User-required behavior from `expectedBehavior`
- Every supplied job ID and turn range
- Actor affected
- Approximate sequence or time window
- Observable actions mentioned
- Behavior implied to be preferable

Observable actions may include:

- Repeated messages
- Unsupported pushback
- Silence
- Flags
- Notes
- Tool calls
- Escalations

The report defines the behavior to investigate, but it does not prove which prompt caused it.

### Step 2: Locate the Relevant Episode

Application code supplies the bounded trace windows. Theo must analyze every supplied window without widening them.

Each selected response window should include:

- The event that initiated the behavior
- Relevant preceding context
- Every Copilot turn selected by the user
- Guard replies between those turns
- Related tool calls
- Related flags, notes, alerts, or escalations

Theo must not widen a requested window to the entire shift.

### Step 3: Describe the Observed Failure

Theo describes what happened before attempting to diagnose why.

The result must distinguish between:

- **Observed facts:** Directly present in the trace
- **Expected behavior:** Supplied directly by the user, interpreted alongside applicable safety policy
- **Inference:** Theo’s interpretation of why the behavior happened

### Step 4: Map Problematic Turns to Prompts

For every problematic Copilot turn, Theo:

1. Reads its `turn_start.trigger`.
2. Selects the corresponding `instructions/*.md` file.
3. Inspects the trigger-specific instruction.
4. Inspects the relevant shared `core/*.md` files.
5. Looks for instructions that are:
   - Missing
   - Ambiguous
   - Conflicting
   - Overly forceful
   - Incorrectly prioritized

Theo must consider the combined effect of the trigger instruction and the shared core prompt.

It must not assume the trigger-specific instruction is solely responsible.

### Step 5: Form One Causal Hypothesis

The hypothesis must connect:

```text
Exact prompt language
        ↓
Likely model interpretation
        ↓
Observed Copilot behavior
```

A valid hypothesis must cite:

- At least one trace reference
- At least one exact prompt passage
- The file containing that passage
- An explanation of why changing it could affect the reported behavior

Theo may consider alternatives internally, but it returns only one primary hypothesis for this one-way pass.

### Step 6: Propose One Minimal Edit

The proposed edit must:

- Target only `prompts/core/*` or `prompts/instructions/*`
- Modify one file
- Include an exact `old_text` substring
- Include the complete replacement `new_text`
- Address the diagnosed cause
- Avoid rewriting unrelated prompt policy
- Preserve safety, coverage, and escalation requirements
- Be specific enough for the Backtest Runner to test

Theo proposes the edit but does not apply it directly.

Deterministic application code validates the proposal and applies it to a copied candidate prompt directory.

## Evidence Requirements

Theo must:

- Cite trace entries using stable references.
- Quote only text present in the supplied trace or prompt files.
- Identify silence through a recorded wake with no following message or relevant action.
- Treat tool calls, flags, notes, and escalations as Copilot behavior.
- Distinguish observation from inference.
- Avoid claiming that correlation proves causation.
- Report uncertainty when multiple instructions could explain the behavior.
- Assume the problem is prompt-rooted, as allowed by the exercise.
- Never blame unavailable application code, hidden tools, or the fixed deliberation gate.

Every diagnosis must answer:

1. What happened?
2. What triggered it?
3. Which instruction likely influenced it?
4. What evidence supports that conclusion?
5. What is the smallest edit that tests the hypothesis?

## Output Contract

Theo returns structured JSON:

```json
{
  "job_ids": ["56370"],
  "what_went_wrong": "The Copilot pushed back repeatedly after a completed patrol and flagged the guard.",
  "failure_mode": "Repeated pushback after a credible patrol-completion report",
  "evidence_windows": [
    {
      "job_id": "56370",
      "start_turn": 9,
      "end_turn": 16,
      "trace_refs": [
        "job:56370:events:81",
        "job:56370:baseline:141",
        "job:56370:baseline:143"
      ]
    }
  ],
  "observed_behavior": [
    {
      "claim": "The Copilot challenged the guard after the guard reported completing the patrol.",
      "trace_refs": ["job:56370:events:81", "job:56370:baseline:143"]
    }
  ],
  "expected_behavior": "Acknowledge a credible completion report and stop pursuing the completed obligation unless contradictory evidence exists.",
  "relevant_turns": [
    {
      "turn_ref": "job:56370:baseline:141",
      "trigger": "guard_message",
      "instruction_file": "instructions/guard_response.md"
    }
  ],
  "prompt_diagnosis": {
    "file": "core/obligations.md",
    "section": "...",
    "exact_text": "...",
    "diagnosis_type": "ambiguous",
    "explanation": "..."
  },
  "hypothesis": "Clarifying when a guard's report satisfies an obligation should prevent repeated follow-up on already-completed work.",
  "proposed_edit": {
    "file": "core/obligations.md",
    "old_text": "...",
    "new_text": "...",
    "intended_effect": "..."
  },
  "risks": [
    "The edit must not cause the Copilot to accept reports that contradict stronger evidence."
  ],
  "confidence": 0.8,
  "uncertainties": []
}
```

Theo’s output must not contain a `fixed`, `passed`, or final quality verdict. Those fields belong to the Judge.

## Output Validation

Before creating the candidate prompt version, deterministic code verifies:

1. `job_ids`, `what_went_wrong`, and `expected_behavior` match the request.
2. Every evidence window matches one requested job and turn range.
3. Every `trace_ref` exists inside its requested window.
4. Every quoted trace passage matches its source.
5. The proposed file is under `prompts/core/` or `prompts/instructions/`.
6. `old_text` exists exactly once in the targeted file.
7. `new_text` differs from `old_text`.
8. The proposal modifies only one file.
9. The diagnosis contains both trace evidence and prompt evidence.

If validation fails, the run should stop with an inspectable error instead of applying an uncertain edit.

## Theo’s Prompt Structure

Theo’s system instructions should include:

1. **Role**
   - Diagnose prompt-rooted failures in historical Copilot traces.

2. **Task**
   - Locate the relevant episode.
   - Identify the likely prompt cause.
   - Propose one minimal edit.

3. **System boundaries**
   - Only `core/` and `instructions/` are mutable.
   - The application code, tools, and deliberation gate are fixed.

4. **Trace model**
   - Explain `shift`, `events`, `baseline`, triggers, messages, tools, and silence.

5. **Method**
   - Observe first.
   - Map triggers.
   - Inspect prompt evidence.
   - Form one hypothesis.
   - Propose one edit.

6. **Evidence requirements**
   - Cite stable trace references.
   - Cite exact prompt text.

7. **Prohibitions**
   - No generic prompt rewrite.
   - No final pass/fail verdict.
   - No unsupported claims.
   - No non-prompt diagnosis.
   - No modification outside the mutable prompt surface.

8. **Output schema**
   - Require the structured JSON contract.

Use a strong reasoning-capable model with structured output enabled. Keep randomness low where the selected model supports it.

## Run Artifacts

Theo should produce:

```text
runs/<run-id>/
├── diagnostic-input.json
├── normalized-trace.json
├── episode.json
├── diagnosis.json
└── proposed-edit.json
```

After validation, the orchestrator creates:

```text
runs/<run-id>/
├── candidate-prompts/
│   ├── core/
│   └── instructions/
└── prompt.diff
```

## Initial Test Case

Use job `56370` first.

The test should confirm that Theo:

1. Finds the guard’s full-site and both-buildings completion report.
2. Includes all three subsequent pushbacks and the related flag.
3. Maps the relevant turns to their recorded triggers.
4. Identifies the corresponding instruction files.
5. Cites exact trace evidence.
6. Cites exact prompt language supporting the diagnosis.
7. Produces one narrow edit within the mutable prompt surface.
8. Avoids deciding whether the edit worked.

## Definition of Done

Theo is complete when one invocation can take a structured `56370` problem report and produce:

- Correctly bounded trace evidence for every requested response window
- A factual description of the failure
- Stable references to supporting historical evidence
- The relevant triggers and instruction files
- An exact prompt passage connected to the behavior
- One clear causal hypothesis
- One valid, minimal edit proposal
- A structured result that passes deterministic validation

Theo is successful even if the Judge later determines that the proposed edit did not fix the reported problem.
