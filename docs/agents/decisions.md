# Decisions

The log of decisions every crew must follow. Prompts include the locked decisions filtered by topic.

- Anyone may propose a decision (in a request issue or an agent's `decisions[]`). **Only the orchestrator locks
  one.** A locked decision changes only by a new decision that supersedes it.
- Ids are `D-001`, `D-002`, … in order, never reused.
- Topics: `direction`, `identity`, `content`, `stack`, `motion`, `effects`, `scroll`, `type`, `budgets`,
  `a11y`, `release`, `manor-bridge`.
- When rules conflict, resolve them in this order: the owner's own words; non-negotiables, budgets,
  accessibility and licences; locked decisions; the topic owner; whichever option serves a story beat more
  directly; fewer dependencies, less code, less motion; the orchestrator decides and logs it here.

## Entry format

```md
### D-000 · <short title>
- Topics: stack, budgets
- Status: proposed | locked (YYYY-MM-DD)
- Decision: <one or two sentences>
- Why: <the reason, with evidence links>
- Supersedes: — | D-0xx
```

## Log

No decisions yet. The first ones are locked in Wave 2.
