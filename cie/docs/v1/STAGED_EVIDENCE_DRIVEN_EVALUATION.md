# Staged Evidence-Driven Evaluation

Staged Evidence-Driven Evaluation means the system does **not** hand one giant trace blob to every model and ask it to fix everything at once.

Instead, CIE breaks the work into small evidence-gated stages:

1. **Diagnose** finds a specific target issue from trace evidence.
2. **Theo profile/triage** turns that issue into a compact case brief and decides what kind of candidate intervention is appropriate.
3. **Theo candidate** proposes one generalized candidate fix for that target.
4. **Replay** executes the candidate when it is replayable, currently prompt candidates only.
5. **Maya** judges whether the selected target issue was resolved using before/after evidence.

The important idea: each model stage receives only the evidence it needs for that stage, with explicit target scope and artifacts saved between stages.

## Example: What the Model Sees at Each Stage

### 1. Diagnose stage

Purpose: discover concrete failures in a bounded trace window.

Model-facing shape:

```text
You are evaluating this trace for the Tool Use lens.

Focus areas:
- Missing required tool reads
- Failed tool calls without recovery
- Tool evidence ignored by the copilot

<diagnose_input>
{
  "jobId": "12345",
  "startTurn": 8,
  "endTurn": 12,
  "summary": "Guard asked about check-out. Copilot responded without reading job logs.",
  "messages": [
    { "ref": "turn-9.guard", "role": "guard", "text": "I finished patrol, do I check out now?" },
    { "ref": "turn-9.copilot", "role": "copilot", "text": "Yes, you can check out." }
  ],
  "toolCounts": { "get_job_logs": 0, "get_guard_status": 0 },
  "evidenceRefs": ["turn-9.guard", "turn-9.copilot"]
}
</diagnose_input>
```

Expected model output:

```json
{
  "summary": "Copilot gave check-out guidance without verifying required state.",
  "findings": [
    {
      "id": "tool-use-checkout-no-read",
      "title": "Check-out advice given without evidence read",
      "severity": "high",
      "confidence": 0.86,
      "diagnosis": "The copilot authorized check-out without reading job logs or guard status.",
      "likelyCause": "The prompt or workflow did not force evidence verification before check-out guidance.",
      "suggestedFix": "Require a status/log read before advising check-out.",
      "suggestedCandidateKind": "prompt",
      "replayableHint": true,
      "requiresManualValidationHint": false,
      "evidence": [
        { "ref": "turn-9.guard", "summary": "Guard asked whether to check out." },
        { "ref": "turn-9.copilot", "summary": "Copilot said yes without tool evidence." }
      ]
    }
  ]
}
```

### 2. Theo case profile stage

Purpose: compress the selected finding into a clean case profile.

Model-facing shape:

```text
Selected target issue:
- ID: tool-use-checkout-no-read
- Diagnosis: Copilot authorized check-out without reading job logs or guard status.
- Expected behavior: Copilot should verify status/log evidence before giving check-out guidance.

Compact trace context:
- Turn 9 guard: "I finished patrol, do I check out now?"
- Turn 9 copilot: "Yes, you can check out."
- Tool summary: no get_job_logs or get_guard_status calls in selected window.
```

Expected internal artifact:

```json
{
  "targetIssue": "tool-use-checkout-no-read",
  "relevantTurns": [9],
  "evidenceSummary": "The copilot answered a check-out question without checking logs/status.",
  "missingEvidence": ["get_job_logs", "get_guard_status"],
  "risk": "Incorrect operational authorization"
}
```

### 3. Theo triage stage

Purpose: decide what kind of candidate intervention should be proposed.

Model-facing shape:

```text
Case profile:
The copilot gave check-out permission without evidence reads.

Diagnosis hint:
- suggestedCandidateKind: prompt
- replayableHint: true

Available candidate kinds:
- prompt
- tool
- context
- workflow
- safety
- code
- test
- unknown
```

Expected output:

```json
{
  "candidateKind": "prompt",
  "replayable": true,
  "rationale": "The behavior can be tested by changing the instruction that governs check-out guidance."
}
```

### 4. Theo candidate stage

Purpose: produce one generalized candidate fix.

Model-facing shape:

```text
Generate a candidate intervention for this target only.

Target issue:
Copilot authorized check-out without evidence reads.

Relevant prompt file excerpt:
core/obligations.md:
"Help guards complete shift tasks and answer operational questions."

Required output:
- candidate kind
- exact prompt edit if kind is prompt
- why this should fix the target
- validation target for Maya
```

Expected output:

```json
{
  "candidateKind": "prompt",
  "title": "Require evidence before check-out guidance",
  "rationale": "Adds a mandatory verification step before advising check-out.",
  "promptEdits": [
    {
      "file": "core/obligations.md",
      "oldText": "Help guards complete shift tasks and answer operational questions.",
      "newText": "Help guards complete shift tasks and answer operational questions. Before advising a guard to check out, verify current shift state using job logs or guard status evidence. If verification is unavailable, ask for clarification or escalate instead of authorizing check-out."
    }
  ],
  "mayaTarget": {
    "issueId": "tool-use-checkout-no-read",
    "expectedResolution": "Candidate copilot should not authorize check-out until it has checked relevant status/log evidence."
  }
}
```

### 5. Replay stage

Purpose: execute the candidate behavior against the same selected turn window.

Model-facing shape for candidate replay:

```text
System prompt includes candidate prompt edit.

Prior compact context:
- Guard asked about check-out.
- Original copilot answered without tools.
- Historical tool activity summarized, not replayed as full raw payloads.

Current user turn:
"I finished patrol, do I check out now?"

Available tools:
- get_job_logs
- get_guard_status
- escalate_to_ops
- request_copilot_dm
```

Expected candidate behavior:

```text
Tool call: get_guard_status(job_id=12345)
Tool call: get_job_logs(job_id=12345)
Copilot: "I need to verify your current shift status before confirming check-out..."
```

If the candidate kind is not `prompt`, replay stops and creates manual-validation guidance instead.

Example:

```json
{
  "code": "MANUAL_VALIDATION_REQUIRED",
  "phase": "diagnosis_hint",
  "candidateKind": "workflow",
  "message": "This target requires a workflow/manual validation path, not prompt replay."
}
```

### 6. Maya judgment stage

Purpose: judge whether the selected target issue was resolved.

Model-facing shape:

```text
You are judging one target issue only.

Target issue:
Copilot authorized check-out without evidence reads.

Original evidence:
- Guard asked: "I finished patrol, do I check out now?"
- Original copilot answered: "Yes, you can check out."
- Original tools: no job log/status reads.

Candidate evidence:
- Candidate called get_guard_status.
- Candidate called get_job_logs.
- Candidate did not authorize check-out until after verification.

Expected resolution:
Candidate copilot should not authorize check-out until it has checked relevant status/log evidence.
```

Expected output:

```json
{
  "resolved": true,
  "confidence": 0.91,
  "verdict": "pass",
  "reasoning": "The candidate corrected the target failure by reading relevant evidence before giving check-out guidance.",
  "remainingRisks": []
}
```

## Why This Helps

- Smaller prompts at each stage.
- Better debugging because every stage writes artifacts.
- Lower risk of models fixing the wrong thing.
- Supports non-prompt candidates without pretending they can be replayed.
- Lets Maya judge one target issue at a time instead of a vague batch of findings.
