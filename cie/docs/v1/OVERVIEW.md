# CIE v1 Overview: User-Defined Agent Tests

## Goal

Extend the existing Copilot Improvement Engine so users can test an agent according to the question they actually care about.

Target flow:

```text
User question
  → platform drafts test criteria
  → user confirms or edits criteria
  → platform evaluates traces/artifacts
  → result is saved as a reusable test
```

This should build **on top of the current CIE infrastructure**. Do not rebuild or replace the replay, artifact, Theo, Maya, Niko, prompt-versioning, or frontend backtest foundations unless a narrow adapter is required.

## Why this matters

Today CIE is strongest at this loop:

```text
Known bad callout
  → Theo diagnoses prompt cause
  → candidate prompt version is created
  → Copilot replay runs old vs new
  → Maya judges whether the callout was fixed
```

That works for known failures like:

- Copilot pushed back too hard after a patrol report.
- Copilot went silent across scheduled wakes.

But the platform also needs to support broader product/evaluation questions, for example:

> The Copilot writes an updated guard profile after each shift. It deletes the old profile and writes a compacted new one. Is it doing that properly?

That question does not start as a prompt bug. It starts as a user-defined evaluation need. The platform should turn that into inspectable criteria, let the user approve the criteria, evaluate real traces/artifacts, and save the resulting test for reuse.

## Existing infrastructure to build on

The repo already has much of what this needs:

- **Trace/replay loading**
  - `copilot-simulation/shift-loader.ts`
  - `copilot-simulation/episode-builder.ts`
  - `copilot-simulation/copilot-original.service.ts`
  - `copilot-simulation/copilot-simulation.service.ts`

- **Evidence shaping**
  - `mastra/theo/trace-normalizer.ts`
  - `mastra/maya/evidence-packet.ts`

- **Deterministic measurements**
  - `mastra/maya/measurements.ts`

- **Model-based evaluation**
  - `mastra/maya/runner.ts`
  - `mastra/maya/verdict-validator.ts`

- **Artifact persistence**
  - `cie/runs/*`
  - `cie/database/simulate-*.json`

- **Prompt candidate/version lifecycle**
  - `mastra/theo/prompt-versioner.ts`
  - `mastra/theo/candidate-decision.service.ts`

- **Frontend operating shell**
  - `frontend/app/backtest/*`

The new work should primarily add a **test-spec layer** and a **general evaluation layer** above these existing systems.

## Required new capability

### 1. User question intake

The platform should accept a plain-language question such as:

```text
Is the Copilot updating guard profiles properly after each shift?
```

The user may optionally provide:

- job/shift IDs
- trace windows
- artifacts to inspect
- examples of good/bad behavior
- policy or contract references
- severity preferences

The input should not require the user to know the internal schema.

### 2. Draft test criteria generation

Add a criteria-generation step before evaluation.

This can be a new agent/service, separate from Theo and Maya. Its job is to draft a structured `TestSpec` from the user question and available evidence types.

It should output something like:

```json
{
  "name": "Guard profile update quality",
  "userQuestion": "Is the Copilot updating guard profiles properly after each shift?",
  "agentSurface": "guard_profile_update",
  "criteria": [
    {
      "id": "preserve-durable-facts",
      "importance": "critical",
      "description": "The updated profile preserves durable guard facts from the prior profile unless the latest shift contradicts them.",
      "passRule": "No important durable prior fact is removed without trace evidence or an explicit rationale."
    },
    {
      "id": "capture-new-signal",
      "importance": "major",
      "description": "The updated profile captures meaningful new behavior from the latest shift.",
      "passRule": "Important new patterns or repeated behaviors from the shift are reflected concisely."
    },
    {
      "id": "no-hallucinated-claims",
      "importance": "critical",
      "description": "The updated profile does not add claims unsupported by the shift trace or previous profile.",
      "passRule": "Every new behavioral claim has supporting evidence."
    }
  ],
  "requiredEvidence": [
    "previous_guard_profile",
    "latest_shift_trace",
    "profile_update_tool_call_or_write",
    "resulting_guard_profile"
  ],
  "passCondition": "All critical criteria pass and no more than one major criterion fails."
}
```

### 3. User confirmation/editing

The generated criteria are not automatically authoritative.

The user must be able to:

- accept the generated criteria
- edit criteria text
- change importance/severity
- add/remove criteria
- save the test
- run once without saving

This confirmation step is important because client success criteria may come from contracts, internal policy, customer expectations, or product judgment. The model can draft criteria, but the user/customer owns acceptance.

### 4. Saved test specs

Introduce a persisted test definition object, likely as JSON first.

Suggested location:

```text
cie/test-specs/
```

Suggested shape:

```ts
type TestSpec = {
  id: string;
  version: string;
  name: string;
  description?: string;
  userQuestion: string;
  agentSurface: string;
  criteria: Criterion[];
  requiredEvidence: string[];
  passCondition: string;
  createdAt: string;
  updatedAt: string;
};

type Criterion = {
  id: string;
  importance: "critical" | "major" | "minor";
  description: string;
  passRule: string;
  evidenceNeeded?: string[];
};
```

A saved test should be reusable against future traces, jobs, candidates, or production runs.

### 5. General evidence packet builder

Maya’s current evidence packet is tuned to old-vs-candidate replay comparison. Keep that path intact.

Add a generalized evidence packet layer that can support evaluation targets like:

- a single trace
- old vs new replay
- before/after memory/profile artifacts
- tool-call side effects
- final agent answer quality
- policy compliance
- multimodal/image outputs later

For the guard-profile example, the evidence packet should include:

- previous guard profile
- shift events/messages/actions
- profile update prompt/input if available
- tool call or file write that replaced the profile
- resulting guard profile
- references for every extracted claim

### 6. General evaluator using confirmed `TestSpec`

Maya can either be extended behind an adapter or a new evaluator can be added that reuses Maya’s runner/validation patterns.

Input:

```json
{
  "testSpec": { ... },
  "evidence": { ... }
}
```

Output:

```json
{
  "verdict": "pass" | "fail",
  "passed": true,
  "confidence": 0.87,
  "criteriaResults": [
    {
      "criterionId": "no-hallucinated-claims",
      "status": "pass" | "fail" | "warning",
      "summary": "No unsupported new claims found.",
      "evidenceRefs": ["profile:new:claim:2", "shift:event:183"]
    }
  ],
  "limitations": [
    "Previous profile source was missing, so preservation could only be partially judged."
  ]
}
```

The evaluator should judge the confirmed criteria, not invent new ones during grading.

### 7. Deterministic checks where possible

Model judging should be supported, but not used for everything.

The platform should allow each `TestSpec` to request deterministic checks, such as:

- profile length / compression ratio
- number of new claims
- unsupported claim count when references are available
- deleted durable facts
- tool-call presence/absence
- message count
- silence count
- flags/escalations
- cost/latency, once wired into CIE runs

This should extend the existing Maya measurement approach rather than replace it.

### 8. Saved evaluation runs

Each evaluation should write artifacts in the existing run-artifact style:

```text
cie/runs/eval-<timestamp-or-sequence>/
  test-spec.json
  evidence-packet.json
  measurements.json
  verdict.json
  run-metadata.json
```

The result should be inspectable and replayable.

### 9. Optional improvement step

The new user-defined testing flow should not require prompt editing.

Initial target:

```text
question → criteria → confirmed test → evaluate trace → save test
```

Later, if the test fails, the existing Theo/prompt-version/replay/Maya flow can be invoked as a follow-up:

```text
failed test
  → diagnose likely cause
  → propose candidate change
  → replay or rerun artifact generation
  → evaluate against saved test
```

This keeps the generalized testing platform separate from the prompt-improvement loop while still allowing them to connect.

## Guard profile update example

A user asks:

```text
Is the Copilot updating guard profiles properly after each shift?
```

The platform drafts criteria like:

1. **Preservation**  
   Keep durable useful facts from the previous profile unless contradicted.

2. **New signal capture**  
   Add meaningful patterns from the latest shift.

3. **No hallucination**  
   Do not add claims unsupported by the shift trace/profile history.

4. **No overfitting**  
   Do not turn a one-off event into a permanent trait unless justified.

5. **Conciseness / compaction quality**  
   The new profile should be compact and useful, not an append-only log.

6. **Future usefulness**  
   The update should help the next Copilot make better decisions.

7. **Safety/fairness**  
   Avoid unfair, insulting, or unsupported characterization of the guard.

The user confirms or edits those criteria. The platform then evaluates one or more guard-profile update traces and saves the test for future use.

## Implementation guidance

Prefer additive changes:

- Add `test-specs/` rather than changing prompt versions.
- Add a criteria-generator service rather than overloading Theo.
- Add a general evaluator adapter rather than rewriting Maya.
- Reuse Maya evidence/measurement/verdict patterns.
- Reuse existing run artifact conventions.
- Reuse the frontend backtest shell/components where practical.

Avoid unnecessary churn in:

- Copilot replay mechanics
- replay-safe tool handling
- Niko guard simulation
- Theo prompt diagnosis
- prompt candidate versioning
- candidate accept/reject lifecycle
- existing Maya callout judge

## Success bar for this extension

A first useful version should demonstrate:

1. User enters a plain-language testing question.
2. Platform generates structured criteria.
3. User can confirm the criteria.
4. Platform builds an evidence packet from an existing trace/artifact.
5. Evaluator grades each confirmed criterion with evidence references.
6. Test spec and evaluation result are saved.
7. Same saved test can be run again on another trace or artifact.

This will turn CIE from a targeted prompt-backtesting tool into a broader platform for user-defined agent evaluation while preserving the infrastructure already built.
