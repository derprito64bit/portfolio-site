// The wait rule (owner, 2026-10-27; PLAN.md "Waits and context"): no LLM tool call blocks longer than 270 s, because the
// prompt cache lives 5 minutes. Every fleet script that waits clamps to this; its role prompts quote WAIT_RULE.
export const MAX_SEC = 270;
export const DEFAULT_SEC = 240;
export const clampSec = (s) => Math.max(1, Math.min(MAX_SEC, Number.isFinite(Number(s)) && Number(s) > 0 ? Number(s) : DEFAULT_SEC));
