# Notes v2: Maya targets by lens

## Summary

Maya should not receive one bundled evaluation target for an entire user-defined test.

For v1, each evaluation lens should produce its own explicit target, and Maya should grade each target independently. The final result can still roll those judgments up into one overall verdict, but the unit of judgment should be:

```text
one lens → one target → one Maya evaluation → one lens result
```

not:

```text
many lenses → one combined target → one Maya evaluation
```

## Why

A single bundled target makes Maya's job muddy. If the user asks a broad question, such as:

> Is the Copilot updating guard profiles properly after each shift?

that question may contain several distinct lenses:

- preservation of durable facts
- capture of new shift signal
- no hallucinated claims
- no overfitting from one-off events
- conciseness / compaction quality
- future usefulness
- safety and fairness

Those lenses are related, but they are not the same judgment. Bundling them into one target can hide which part passed or failed and can let a strong result on one lens compensate for a weak result on another.

## Desired structure

The confirmed test spec should separate lenses from targets clearly.

Example shape:

```json
{
  "testName": "Guard profile update quality",
  "userQuestion": "Is the Copilot updating guard profiles properly after each shift?",
  "lenses": [
    {
      "id": "preserve-durable-facts",
      "label": "Preservation",
      "target": {
        "statement": "The updated profile preserves durable useful facts from the previous profile unless the latest shift contradicts them.",
        "passRule": "No important durable prior fact is removed without supporting trace evidence or an explicit rationale.",
        "evidenceNeeded": ["previous_profile", "updated_profile", "shift_trace"]
      }
    },
    {
      "id": "no-hallucinated-claims",
      "label": "No hallucination",
      "target": {
        "statement": "The updated profile does not introduce claims unsupported by the shift trace or prior profile.",
        "passRule": "Every new behavioral claim has a supporting evidence reference or is marked as uncertain.",
        "evidenceNeeded": ["updated_profile", "shift_trace", "prior_profile"]
      }
    }
  ]
}
```

## Maya evaluation contract

Maya should evaluate each lens target separately.

Input per Maya call:

```json
{
  "testName": "Guard profile update quality",
  "lens": {
    "id": "no-hallucinated-claims",
    "label": "No hallucination"
  },
  "target": {
    "statement": "The updated profile does not introduce claims unsupported by the shift trace or prior profile.",
    "passRule": "Every new behavioral claim has a supporting evidence reference or is marked as uncertain."
  },
  "evidence": { }
}
```

Output per lens:

```json
{
  "lensId": "no-hallucinated-claims",
  "status": "pass",
  "confidence": 0.91,
  "summary": "No unsupported new claims were found.",
  "evidenceRefs": ["profile:new:claim:2", "shift:event:183"],
  "limitations": []
}
```

Then the application layer aggregates lens results into the overall test result.

## Rollup rule

The rollup should be deterministic and visible.

Suggested default:

- any `critical` lens fails → overall fail
- any `major` lens fails → overall fail unless explicitly configured as warning-only
- `minor` failures can produce overall warning
- all required lenses pass → overall pass

The important point: Maya should not decide the whole rollup from a vague bundled prompt. Maya grades lens targets; application code performs the rollup.

## Implementation note

This fits the existing v1 direction:

1. User asks a broad question.
2. Criteria generator drafts lenses.
3. User confirms/edits lenses and targets.
4. Evidence builder prepares shared evidence once.
5. Maya evaluates each lens target independently.
6. The system saves each lens result plus the deterministic rollup.

Artifact layout can stay inspectable:

```text
cie/runs/eval-<id>/
  test-spec.json
  evidence-packet.json
  lens-results/
    preserve-durable-facts.json
    no-hallucinated-claims.json
  verdict.json
  run-metadata.json
```

This keeps broad user-defined evaluations clear, debuggable, and reusable.

## UI cleanup note

The evaluation UI should be cleaner and less overwhelming.

Because v1 introduces lenses, targets, evidence packets, measurements, and Maya results, the frontend should avoid showing everything at once. The default view should make the run understandable at a glance, with details available progressively.

Recommended layout:

1. **Run summary first**
   - overall pass/fail/warning
   - user question
   - job/trace evaluated
   - number of lenses passed/failed/warned

2. **Lens cards instead of one large verdict blob**
   - one card per lens
   - show lens name, status, confidence, and one-line summary
   - expand card to reveal target, pass rule, evidence refs, and limitations

3. **Target toggle / switcher**
   - users should be able to toggle between individual lens targets instead of reading one combined blob
   - each selected target view should show only that target's statement, pass rule, Maya result, evidence, and limitations
   - provide an “All targets” summary view for quick scan, but keep per-target details separated
   - preserve the selected target in the URL or UI state so results can be shared and revisited directly

4. **Hide raw artifacts by default**
   - keep `test-spec.json`, `evidence-packet.json`, measurements, and raw Maya output accessible
   - put them behind “View raw artifact” or “Developer details” sections

4. **Use plain-language labels**
   - prefer “What Maya checked” over “target statement”
   - prefer “Why it passed/failed” over “criteria result”
   - prefer “Evidence used” over “evidence refs”

5. **Make failures actionable**
   - failed lens cards should show the exact failed pass rule
   - include the smallest useful evidence excerpt
   - include suggested next action if available: rerun, inspect trace, revise target, or start improvement loop

The goal is that a non-engineer can understand the result without reading JSON, while an engineer can still drill into every saved artifact when needed.

## Master policy from Copilot prompts

CIE should build a master policy from the existing Copilot prompt system and instruction files.

This master policy represents the default behavior the Copilot should always follow, regardless of the specific user-defined test or prompt-change backtest. It should be derived from:

- `prompts/core/*`
- `prompts/instructions/*`
- relevant generated prompt examples where useful for validation, but not as the source of truth

The policy should capture durable behavioral rules such as:

- when Copilot should message the guard
- when Copilot should stay silent
- when to escalate to ops
- tone expectations
- evidence requirements before challenging a guard
- obligations around patrols, reports, check-ins, geofence issues, app termination, and shift ending
- safety constraints and communication boundaries

The master policy should not replace per-lens targets. Instead, it should act as the baseline regression/safety layer:

```text
candidate behavior
  → evaluate against user-selected lens targets
  → also evaluate against master policy
  → pass only if targeted behavior improves without violating default Copilot behavior
```

This avoids a prompt change that fixes one callout while quietly breaking core Copilot behavior elsewhere.

Recommended approach:

1. Extract candidate policy rules from the mutable prompt files.
2. Normalize them into stable policy checks with ids, descriptions, severity, and evidence requirements.
3. Let humans review/edit the generated policy before it becomes canonical.
4. Version the policy alongside prompt versions.
5. Run relevant policy lenses automatically on every candidate replay.

Example policy rule shape:

```json
{
  "id": "challenge-guard-only-with-evidence",
  "severity": "critical",
  "source": "prompts/core/holding_the_post.md",
  "description": "Copilot should not repeatedly challenge a guard's patrol report unless telemetry, site evidence, or prior context creates a specific reason for concern.",
  "passRule": "Any pushback must cite a concrete inconsistency or risk; repeated pushback without new evidence fails."
}
```

In the UI, master-policy results should be shown separately from user-selected targets so users can distinguish:

- “Did this fix the thing I asked about?”
- “Did this preserve the Copilot's default required behavior?”
