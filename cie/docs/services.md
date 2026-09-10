# Copilot Simulation Services

The `src/copilot-simulation` directory has three main services. Together, they run a backtest from prompt diagnosis through final judgment.

## `CopilotBacktestService`

This is the coordinator for the complete backtest.

It:

1. Validates the job ID, turn range, callout, and expected behavior.
2. Sends the reported problem to Theo.
3. Receives a new prompt version from Theo.
4. Runs the original behavior and candidate behavior over the same turns.
5. Sends both replay results to Maya.
6. Records whether the candidate prompt fixed the reported problem.

Think of this service as the test manager.

## `CopilotOriginalService`

This service provides the old behavior used as the control group.

It:

- Reads Copilot output from the recorded shift or a previous simulation.
- Selects the requested turn range.
- Returns the old messages, actions, guard replies, and shift events.
- Does not run a new AI model when reading the recorded shift.

Think of this service as the saved baseline.

## `CopilotSimulationService`

This service runs the candidate Copilot behavior.

It:

- Loads the shift and selected turns.
- Loads Theo's candidate prompt version.
- Rebuilds the conversation and workspace state from before the selected turns.
- Calls Copilot once for each selected turn.
- Records messages and tool calls.
- Replays read-only data and simulates operational side effects safely.
- Uses Niko to simulate guard replies after the candidate conversation diverges from history.
- Compares candidate output with historical output.
- Saves the completed simulation log.

Think of this service as the experiment.

## Supporting Files

### `candidate-prompt-loader.ts`

Loads the prompt version created by Theo.

It:

- Finds the version folder for the job.
- Reads its `version.json` manifest.
- Checks that the job, version, and changed file are valid.
- Checks file hashes so modified or corrupt prompt files are rejected.
- Returns the verified prompt folder and description of the change.

Think of this file as the prompt package inspector.

### `episode-builder.ts`

Chooses the part of the shift to replay.

It:

- Validates the requested start and end turns.
- Finds replayable turns inside that range.
- Finds the timestamp immediately before the first selected turn.
- Collects recorded tool calls belonging to those turns.

Think of this file as the scene selector.

### `history-compactor.ts`

Builds a smaller starting history for the replay.

It:

- Recreates the latest virtual workspace files from earlier writes.
- Keeps the latest 20 guard and Copilot messages.
- Keeps the latest useful guard-location result.
- Keeps up to 20 relevant job logs.
- Removes repeated reads and other history that adds little value.

Think of this file as packing only the useful history into a small suitcase.

### `output-comparison.ts`

Makes old and new Copilot output comparable.

It:

- Normalizes tool names.
- Normalizes message spacing and removes duplicate messages.
- Keeps operational actions such as messages, notes, tasks, flags, and escalations.
- Separates guard messages from other actions.
- Compares normalized old and candidate outputs to detect divergence.

Think of this file as the comparison referee.

### `shift-loader.ts`

Finds and loads shift data.

It:

- Validates that the job ID contains digits only.
- Finds the bundle folder containing `shifts/` and `prompts/`.
- Reads `shifts/{jobId}.json`.
- Checks that the file contains shift details, events, and baseline output.
- Returns clear errors for missing or invalid shifts.

Think of this file as the shift librarian.

### `simulation-log-writer.ts`

Saves completed simulation results.

It:

- Finds the next available simulation number.
- Creates `cie/database/simulate-{number}.json` without overwriting old logs.
- Saves job context, selected turns, model settings, original output, and candidate output.
- Returns the simulation number and saved file path.

Think of this file as the permanent test recorder.

## Complete Flow

```text
CopilotBacktestService
    |
    |-- Theo diagnoses the problem and creates a candidate prompt
    |
    |-- CopilotOriginalService loads the old behavior
    |
    |-- CopilotSimulationService runs the candidate behavior
    |
    |-- Maya compares the old and candidate results
    |
    `-- The decision and artifacts are saved
```

During replay, no real guard messages, flags, tasks, notes, alerts, or operations escalations are created. These calls are recorded and simulated so their behavior can still be inspected and judged.
