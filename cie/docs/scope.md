# Calvis Copilot Backtesting Plan

## Objective

Build a working, one-way pass through steps 2–7 of the Calvis Copilot improvement loop.

Given a plain-language callout naming a shift, the system will:

1. Locate the relevant episode in the shift data.
2. Diagnose which editable prompt instruction likely caused or failed to prevent the reported behavior.
3. Produce a real, versioned prompt edit.
4. Replay the original and candidate prompt versions against the same shift episode.
5. Judge whether the candidate fixed the original callout.
6. Return a yes/no verdict with measurements and inspectable evidence.

The goal is to demonstrate the backtesting machine. The candidate prompt does not need to pass on its first attempt.

## Methodology

This prototype applies the evaluation flywheel to one production callout:

1. **Analyze:** Use the callout and historical shift episode to diagnose the likely prompt-level cause.
2. **Improve:** Create one targeted, versioned prompt edit.
3. **Measure:** Replay the original and candidate prompts under the same conditions, then judge whether the candidate addressed the callout.

The callout acts as the behavioral specification. The judge converts it into narrow evaluation criteria rather than applying a generic quality score.

## Scope

### In scope

- One callout supplied as plain text.
- One shift identified from that callout.
- One relevant, possibly multi-turn episode from the shift.
- One diagnosis and one prompt-edit attempt.
- One replay of the original prompt version.
- One replay of the candidate prompt version.
- Simulated guard replies when the candidate conversation diverges from history.
- One callout-specific judgment with evidence and measurements.

### Out of scope

- Generating the original callout; Calvis already has this system.
- Repeating diagnosis and editing until a prompt passes.
- A general-purpose eval platform.
- A permanent master-policy or regression suite.
- Running every candidate against all ten shifts.
- Automatic production deployment.
- Detecting tool or application bugs unrelated to prompts.
- Reimplementing Calvis infrastructure or the deliberation gate.
- A dashboard or production-ready interface.

## Prompt Boundaries

The only mutable prompt surface is:

```text
prompts/core/*
prompts/instructions/*
```

The system may read but must not edit:

```text
prompts/PROMPTS.md
prompts/ASSEMBLED_SYSTEM_PROMPT.md
prompts/turn_message/*
```

A candidate prompt version should be created as a copy of `core/` and `instructions/`. The original files should remain unchanged, and the resulting file-level diff must be saved with the run.

## Data Model

Each shift JSON contains:

- `shift`: Initial job, site, guard, schedule, and instruction context.
- `events`: Guard messages, location, telemetry, and job events around the Copilot.
- `baseline`: Historical Copilot behavior.
  - `turn_start`: When the Copilot woke and what triggered it.
  - `copilot_message`: Text sent to the guard.
  - `tool_call`: Tools and actions used, including inputs and outputs.
  - A wake without a message or relevant action: The Copilot chose silence.

The historical baseline is evidence of what happened in production. It is not assumed to be the correct behavior. The callout identifies the behavior that should be investigated.

## End-to-End Flow

```text
Plain-language callout
        ↓
Extract shift ID and reported behavior
        ↓
Locate the relevant shift episode
        ↓
Diagnose the likely prompt cause
        ↓
Create a versioned candidate prompt and diff
        ↓
Replay original and candidate versions
        ↓
Judge both trajectories against the callout
        ↓
Yes/no verdict, measurements, and evidence
```

## Component 1: Diagnostic and Editor

### Responsibility

Determine which part of the mutable prompt system likely caused or failed to prevent the reported behavior, then create one targeted edit.

### Inputs

- Original callout.
- Relevant shift episode.
- Historical Copilot messages and actions from `baseline`.
- `prompts/core/*`.
- The trigger-specific file from `prompts/instructions/*`.

### Process

1. Parse the callout and extract its shift ID.
2. Find the guard event or Copilot turn described by the callout.
3. Collect the smallest surrounding sequence required to understand the behavior.
4. Use each `turn_start.trigger` to identify the corresponding instruction file.
5. Inspect that instruction alongside the relevant shared core files.
6. Produce one explicit hypothesis connecting prompt language to observed behavior.
7. Copy the mutable prompt files into a candidate version.
8. Apply one narrow edit to the candidate copy.
9. Save the hypothesis and prompt diff.

### Output

- Relevant episode boundaries.
- Suspected prompt file and section.
- Written hypothesis.
- Candidate prompt version.
- Inspectable diff from original to candidate.

## Component 2: Backtest Runner

### Responsibility

Reproduce the relevant Copilot behavior under controlled conditions using both prompt versions.

This should be a thin, deterministic harness around model calls rather than a general autonomous agent.

### System prompt assembly

Concatenate the six `core/` files in this order, separated by a blank line:

```text
identity
→ context
→ holding_the_post
→ obligations
→ comms_policy
→ tools
```

Replace `{COPILOT_CONTEXT}` with the context derived from the shift JSON.

### Turn assembly

For every replayed turn:

1. Read the recorded wake trigger.
2. Select the matching `instructions/*.md` file.
3. Reproduce the relevant turn message content, including events, wake reason, current time, and time remaining.
4. Maintain the conversation history separately, including guard messages.
5. Supply recorded tool results through lightweight mocks where necessary.
6. Capture every generated message, silence decision, tool call, flag, note, and escalation.

### Controlled comparison

Run the same episode twice:

```text
Original prompt version + same episode → original replay
Candidate prompt version + same episode → candidate replay
```

Keep the following fixed wherever possible:

- Model and model parameters.
- Initial shift context.
- Event order and timestamps.
- Tool definitions and available tool results.
- Episode boundaries.

### Guard simulation

When the candidate Copilot says something different, the guard's historical reply may no longer make sense. At that point, use a small model to simulate the guard.

Ground the simulation in:

- The guard profile and shift context.
- The guard's real messages from the episode.
- The historical reply as a behavioral hint.
- The newly generated Copilot message.

The simulator should generate only the guard's next response and should not invent new site facts without support from the shift.

### Output

- Historical baseline episode.
- Original replay trajectory.
- Candidate replay trajectory.
- All messages, silence decisions, and tool actions in chronological order.

## Component 3: Callout-Specific Judge

### Responsibility

Determine whether the candidate prompt addressed the original callout. It should not assign a generic quality score.

### Process

1. Convert the callout into a small set of explicit behavioral criteria.
2. Apply the same criteria to the original and candidate trajectories.
3. Combine deterministic measurements with semantic judgment.
4. Return a binary verdict and explain it using evidence from both runs.

### Example measurements for job 56370

- Number of repeated pushbacks after the guard reported completing the patrol.
- Whether the Copilot acknowledged the completed patrol.
- Whether the Copilot asked the guard to repeat already-completed work.
- Whether the Copilot flagged or escalated without contradictory evidence.
- Total guard-facing messages during the relevant window.

### Required output

```json
{
  "fixed": true,
  "summary": "The candidate accepted the completed patrol and stopped pursuing it.",
  "criteria": [],
  "baseline_measurements": {},
  "original_replay_measurements": {},
  "candidate_measurements": {},
  "evidence": [],
  "confidence": 85
}
```

Confidence is reported as an integer percentage from 0 to 100.

The verdict may be `false`. A failed candidate is still a successful demonstration if the system explains what remained broken and how it measured that result.

## Run Artifacts

Each run should produce an inspectable directory:

```text
runs/<run-id>/
├── input.json
├── episode.json
├── hypothesis.json
├── original-prompts/
│   ├── core/
│   └── instructions/
├── candidate-prompts/
│   ├── core/
│   └── instructions/
├── prompt.diff
├── historical-baseline.json
├── original-replay.json
├── candidate-replay.json
└── verdict.json
```

## Definition of Done

The prototype is complete when one command or function can accept a callout and produce:

- The relevant shift episode.
- A prompt-level diagnosis.
- A real candidate prompt version.
- A visible diff.
- An original replay.
- A candidate replay.
- Simulated guard responses where the conversation diverges.
- A yes/no judgment against the original callout.
- Measurements and evidence supporting the verdict.

At least one end-to-end run must be included with the submission.

## Recommended Demonstration

Use the provided job `56370` aggression callout because it describes an observable, multi-turn failure with measurable actions:

> On job 56370 the guard said he'd walked the full site and checked both buildings. The Copilot pushed back on him three times in four minutes and flagged him. Too hard for what it actually had.

The demonstration should show:

1. The relevant historical messages and flag.
2. The prompt section selected by the diagnostic component.
3. The diagnostic hypothesis.
4. The exact candidate edit.
5. Both replay trajectories.
6. The judge's criteria, measurements, evidence, and verdict.

## Future Improvements

These should be described in the final write-up but not implemented for this exercise:

- Promote recurring callouts into permanent regression cases.
- Build a master policy from product requirements, historical failures, customer expectations, and approved human decisions.
- Run candidate prompts against the master policy and a broader shift suite.
- Repeat replays to measure normal model variance and statistical confidence.
- Add stopping rules for repeated prompt-edit attempts.
- Require minimum targeted improvement with no critical regression before shipping.
- Add human approval and production deployment after a passing result.
