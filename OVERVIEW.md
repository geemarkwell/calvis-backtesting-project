## CIE overview

CIE is a **Copilot Improvement Engine** for safely testing and improving Calvis’s security-guard Copilot.

Its main workflow:

**Recorded shift → identify bad behaviour → propose prompt fix → replay shift → judge results → human accepts or rejects**

### Agents

- **Copilot** — The agent being improved. It receives the production-style prompt, shift context, history, events, triggers, and tool results. It responds as the real Guard Copilot would.

- **Theo** — The prompt diagnostician. Theo examines the bad baseline response and expected behaviour, finds the likely prompt-level cause, and proposes one minimal edit. Deterministic validation creates a versioned candidate such as `job-56370-0.1`.

- **Niko** — The simulated guard. Normally recorded guard messages are reused. If the candidate Copilot changes the conversation, Niko can generate coherent guard replies so the remaining replay still makes sense.

- **Maya** — The evaluator. Maya compares the original response against the candidate response and judges whether the reported problem was actually fixed, including evidence, criteria, confidence, and limitations.

### Safety and determinism

CIE never performs real operational side effects during replay:

- Original replay requires exact historical tool-result matches.
- Candidate side-effect calls are intercepted and simulated.
- Read-only calls use recorded shift evidence.
- Missing evidence returns `unavailable_in_replay`.
- Prompt edits are tested on candidate copies first.
- Real prompts change only when a user explicitly accepts the candidate.
- Acceptance revalidates file hashes, exact text, uniqueness, and final prompt assembly.

### What the project accomplishes

CIE turns subjective Copilot complaints into a controlled improvement loop. A user can enter a job, turns, observed problem, and expected behaviour; then one Backtest automatically:

1. Loads the historical baseline.
2. Runs Theo.
3. Creates a versioned prompt candidate.
4. Replays the Copilot using that exact candidate.
5. Uses Maya to evaluate the result.
6. Shows the old and new responses and prompt text.
7. Lets the user accept or reject the change.

Simulation traces are logged under `cie/database/`, while Theo/Maya artifacts and candidate versions remain inspectable for auditing.

In short: **CIE lets you improve the Guard Copilot using real historical shifts without experimenting on live guards or silently changing production prompts.**
