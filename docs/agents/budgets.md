# Budgets

Hard limits for the 2D site. A change that exceeds one fails its gate; raising a budget needs a decision in
[`decisions.md`](decisions.md). Budgets are limits, not targets.

- Each budget names how it is measured, so every crew measures the same way.
- Performance is measured in headed runs on the real GPU; SwiftShader numbers do not count.
- The tiers are the ones the effects decision defines (for example full, reduced, static, none).

| Budget | Limit | Tier or viewport | Measured with | Decision |
|---|---|---|---|---|

No budgets locked yet. They are locked in Wave 2, alongside the definition-of-done targets (Lighthouse
performance ≥ 90 and accessibility ≥ 95).
