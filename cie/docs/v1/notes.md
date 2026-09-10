# Notes

## Diagnosis-driven backtests

Backtest will be updated to let users select a saved diagnosis run as the thing they want to backtest.

When a diagnosis is selected, the backtest flow should fill from the selected pattern:

- `patterns.id`
- `diagnosis`
- `likelyCause`
- `suggestedFix`
- `expectedBehavior` — not created yet

The missing `expectedBehavior` parameter should describe what Maya should judge. In other words, it is the target behavior that proves the issue is resolved.

Planned flow:

1. User runs Discover Problems and saves/keeps a diagnosis run.
2. User selects a diagnosis run/pattern in Backtest.
3. Backtest pre-fills the problem context from the selected diagnosis pattern.
4. Theo uses the diagnosis and `suggestedFix` to propose a prompt change.
5. The candidate prompt is replayed against the same shift window.
6. Maya judges against `expectedBehavior` and confirms whether the diagnosis issue was resolved.

This makes diagnosis runs first-class inputs to the existing Theo → replay → Maya loop, instead of requiring the user to manually rewrite the discovered issue as a callout.
