# Maya: Callout-Specific Judge Plan

## Goal

Maya decides whether the candidate prompt fixed the **original callout**.

Maya is not a general quality reviewer. She answers one narrow question:

> Did the candidate Copilot stop the behavior described in this callout?

The required result is `yes` or `no`, supported by measurements and trace evidence.

## What Maya Receives

- The original plain-language callout.
- The relevant historical baseline trace.
- The old-prompt replay trace.
- The candidate-prompt replay trace.
- Computed measurements for both versions.
- Labels showing whether guard replies were historical or simulated.
- Replay warnings, including model or context-parity limitations.

Do not give Maya Theo's hypothesis or intended solution. Maya should judge observed behavior without being persuaded by what the edit was supposed to accomplish.

The final report may show the prompt diff separately.

## Keep the Context Narrow

Do not send the entire shift to Maya when the callout concerns a small episode.

Build an evidence packet containing:

- The turn where the problem began.
- The relevant events immediately before it.
- The following turns needed to determine the outcome.
- Messages, silence decisions, tool calls and escalations from that window.

This prevents unrelated shift data from distracting the judge.

## Measurements

Calculate objective facts before calling Maya. Examples include:

- Number of Copilot messages in the episode.
- Number and timing of repeated requests or pushbacks.
- Whether the Copilot stayed silent on each scheduled wake.
- Whether it requested a patrol report.
- Whether it escalated or flagged the guard.
- Time between the triggering event and the Copilot's action.

Measurements must be derived from the traces. Maya should interpret them, not invent them.

The measurements are selected from the callout. Do not use one generic score for every problem.

## Judgment Process

1. Read the callout and identify its testable claims.
2. Confirm that the historical trace contains the reported failure.
3. Compare the old and candidate traces against those same claims.
4. Check the objective measurements.
5. Decide whether the candidate still exhibits the called-out behavior.
6. Return `yes` only when the evidence shows that the specific behavior was fixed.
7. Otherwise return `no` and explain what remains wrong.

Different wording is not automatically an improvement. Maya judges behavior.

## Maya Prompt

```text
You are Maya, a strict evaluator of a security-shift Copilot.

Your only task is to decide whether the candidate Copilot fixed the behavior described in the original callout.

Rules:
- Judge the original callout, not general response quality.
- Compare behavior, not exact wording.
- Use only the supplied traces and measurements.
- Treat the historical baseline as evidence of the original failure.
- Distinguish historical guard messages from simulated guard messages.
- Do not assume a simulated guard response proves how a real guard would react.
- Cite timestamps, turn IDs, messages or tool calls for every conclusion.
- Return yes only if the candidate no longer exhibits the called-out behavior.
- If the evidence does not show a fix, return no.
- Do not suggest prompt edits.
- Return JSON only.
```

## Output Schema

```json
{
  "fixed": true,
  "verdict": "yes",
  "summary": "The candidate accepted the patrol report without repeatedly challenging or flagging the guard.",
  "confidence": 88,
  "criteria": [
    {
      "claim": "The Copilot repeatedly pushed back after the guard reported completing patrol.",
      "old_measurement": 3,
      "candidate_measurement": 0,
      "passed": true,
      "evidence": ["old turn 18 at 03:12", "candidate turn 18 at 03:12"]
    }
  ],
  "limitations": ["Candidate guard replies after turn 18 were simulated."]
}
```

`fixed` and `verdict` must agree:

- `true` and `yes`
- `false` and `no`

`confidence` is an integer percentage from `0` to `100` describing how
strongly the supplied evidence supports the verdict. It does not change the
verdict. Replay limitations and simulated guard replies should lower it.

Reject invalid or incomplete JSON instead of silently accepting it.

## Example: Job 56370

Callout:

> The guard said he walked the full site and checked both buildings. The Copilot pushed back three times in four minutes and flagged him. Too hard for the evidence it had.

Possible callout-specific criteria:

- Did the Copilot acknowledge the completed patrol?
- How many times did it challenge the same report?
- Did it flag or escalate the guard?
- Was that action supported by new evidence?

The candidate passes only if the unnecessary repeated pressure and unsupported flagging are removed.

## Bias Controls

- Use the same evidence format for old and candidate traces.
- Keep response lengths comparable where possible.
- Do not show Maya Theo's hypothesis or prompt diff.
- Use a separate, configurable judge model with low-variance settings.
- Spot-check Maya's verdict against a human decision.

For the prototype, one Maya call is enough. Do not build voting, multiple judges or a judge debate system.

## Minimum Validation Cases

Before trusting Maya, test her on:

1. The historical failing trace. Expected verdict: `no`.
2. A clearly corrected trace. Expected verdict: `yes`.
3. A trace with different wording but the same bad behavior. Expected verdict: `no`.
4. A trace that improves something unrelated but does not fix the callout. Expected verdict: `no`.

Adjust Maya's rubric only when her result disagrees with the human label.

## Implementation Order

1. Define the evidence-packet type.
2. Compute trace measurements.
3. Implement Maya's structured model call.
4. Validate the returned JSON.
5. Run the minimum validation cases.
6. Connect Maya after the old and candidate replays.
7. Include Maya's verdict and evidence in the final run report.
8. Persist job ID, judgment time, and replay simulation references so verdicts
   can be listed chronologically for one job.
9. Name automatic run directories `maya-{jobId}-{runNumber}` using an
   independent, incrementing sequence for each job.

## Non-Goals

- No master policy covering every possible Copilot behavior.
- No generic quality score.
- No prompt diagnosis or editing.
- No multi-judge voting system.
- No automatic shipping decision.
- No large eval platform for this prototype.

## Definition of Done

- Maya receives the original callout and both replay traces.
- Measurements are computed from trace data.
- Maya returns a valid `yes` or `no` verdict.
- Every criterion includes inspectable evidence.
- Historical and simulated guard messages are clearly distinguished.
- A person can understand why Maya passed or failed the candidate.
- A person can list stored Maya judgments by job ID and compare verdicts,
  criteria, and confidence over time.
- At least one callout completes the full path:

  `callout -> Theo -> prompt version -> old/new replay -> Niko when needed -> Maya -> report`

## Later Improvements

- Build a human-labeled judge dataset from reviewed callouts.
- Measure Maya's true-positive and true-negative rates.
- Add regressions covering the broader Copilot policy.
- Run the judge automatically on every prompt version.

## Design References

- [OpenAI: Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)
- [OpenAI: Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)
- [OpenAI: Graders](https://developers.openai.com/api/docs/guides/graders)
