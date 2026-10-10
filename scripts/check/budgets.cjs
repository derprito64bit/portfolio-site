// The machine-readable budgets block (docs/agents/budgets.md, "```json budgets"). Checks read their numbers from here,
// never from a literal: the sentences in budgets.md stay the human source, and the block mirrors them.
// CommonJS so .size-limit.cjs can require it; ESM callers import it as the default export.
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const ROOT = resolve(__dirname, '../..');
const DEFAULT_FILE = join(ROOT, 'docs/agents/budgets.md');

/** The parsed block of `file` (default: this repo's docs/agents/budgets.md). Throws loudly when it is missing. */
function readBudgets(file = DEFAULT_FILE) {
  const md = readFileSync(file, 'utf8');
  const m = /```json budgets\r?\n([\s\S]*?)\r?\n```/.exec(md);
  if (!m) throw new Error(`budgets: no \`\`\`json budgets block in ${file}`);
  return JSON.parse(m[1]);
}

/** One number from the block by its dotted path (site.preGlJsKbGz); throws when the key is gone or not a number. */
function budget(path, block = readBudgets()) {
  const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), block);
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`budgets: ${path} is not a number in the json budgets block (got ${JSON.stringify(v)})`);
  return v;
}

module.exports = { readBudgets, budget, DEFAULT_FILE };
