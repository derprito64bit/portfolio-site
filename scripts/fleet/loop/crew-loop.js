export const meta = {
  name: 'crew-loop',
  description: 'Lean crew loop (owner 2026-10-27): crew, then gate + breaker + jury in parallel, then the judge; timed perf once at the approval candidate; caps and rules from crew-config.json, embedded by launch.mjs',
  phases: [
    { title: 'Crew loop', detail: 'crew -> gate | breaker | jury -> judge -> perf queue at the approval candidate' },
  ],
}
// The lean pre-launch crew loop (PLAN.md "Operating model"; system review 2026-10-13; owner adoption on #91, comment
// 6452312126). It replaces portfolio-evidence/loop-audit/crew-loop.proposed.js for W-S2 onward.
//   Round:  the crew opens or updates its PR; then, in parallel, the functional gate, the breaker passes and (slices only)
//           the design/motion jury; then the judge. At the approval candidate the timed rows the diff can reach run once,
//           from the detached perf queue; a reproduced fail gets one investigator with main controls.
//   Rules:  the must-fix taxonomy is enforced here, not only in the judge's prompt: a regression needs a main-SHA control,
//           a rare-edge item needs a fix of at most one crew task, a budget item comes only from a reproduced timed fail
//           that main does not share, a design item only from a jury row below target; anything else goes to the #91
//           queue. A busy host means blocked, rerun. Caps come from the config; the loop stops early when the must-fix
//           count has not fallen for stopEarly.flatRounds rounds.
// Launch:   node scripts/fleet/loop/launch.mjs <crew> --spec <spec.md> --spec-meta <meta.json> --out <dir> writes
//           <dir>/crew-loop.<crew>.js (this file plus ONE appended EMBEDDED_ARGS line: the merged config, the spec and its
//           metadata), checks it with crew-loop.check.cjs, and prints the Workflow call (scriptPath, no args).
// Continue: node scripts/fleet/loop/prior-from-journal.cjs <the launched file> <its journal.jsonl> --write <next.js>
//           [--grant code=1] [--refresh <crew-config.json>] [--spec <spec.md> --spec-meta <meta.json>]. Never retype a prior.
// Never edit a launched file by hand: its last line is sealed data.

const WAIT_RULE = 'WAIT RULE (owner, 2026-10-27): no single tool call may block longer than 270 s, because the prompt cache lives 5 minutes and a longer block makes your next step re-read your whole context. Never run gh pr checks --watch, gh run watch, a sleep or Start-Sleep over 240 s, or a lane acquire with -TimeoutMinutes over 4. Wait with node <fleet>\\waitfor.mjs (modes file, pid, exists, checks, cmd; --max 240) and call it again while it exits 75. Anything longer runs detached: builds through build-once.mjs, timed sets through perfq.mjs.'
const ORDER = ['crew', 'verify', 'judge', 'perf']
const CLASSES = ['acceptance', 'regression', 'budget', 'design', 'rare-edge']

// ---- shapes ------------------------------------------------------------------------------------------------------
const ASK = { type: 'object', properties: { line: { type: 'string' }, question: { type: 'string' }, recommended: { type: 'string' }, evidence: { type: 'string' } }, required: ['line', 'question', 'recommended', 'evidence'] }
const ROW = { type: 'object', properties: { item: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'blocked', 'out-of-scope'] }, blockedBy: { type: 'string', enum: ['none', 'host', 'ruling', 'dependency'] }, evidence: { type: 'string' }, negative: { type: 'string' } }, required: ['item', 'status', 'blockedBy', 'evidence', 'negative'] }
const FIXED = ['ci', 'mergeTree', 'visual', 'text', 'targets', 'focusRing', 'flash', 'frames', 'lighthouse']
const CREW = { type: 'object', properties: { branch: { type: 'string' }, sha: { type: 'string' }, prUrl: { type: 'string' }, pushed: { type: 'boolean' }, specSeen: { type: 'string' }, changedFiles: { type: 'array', items: { type: 'string' } }, acceptance: { type: 'array', items: ROW }, needsRuling: { type: 'array', items: ASK }, knownIssues: { type: 'array', items: { type: 'string' } }, handoff: { type: 'boolean' }, handoffNote: { type: 'string' }, summary: { type: 'string' } }, required: ['branch', 'sha', 'prUrl', 'pushed', 'specSeen', 'changedFiles', 'acceptance', 'needsRuling', 'knownIssues', 'handoff', 'handoffNote', 'summary'] }
const GATE = { type: 'object', properties: { pass: { type: 'boolean' }, sha: { type: 'string' }, mainSha: { type: 'string' }, distHash: { type: 'string' }, specSeen: { type: 'string' }, fixed: { type: 'object', properties: Object.fromEntries(FIXED.map(k => [k, ROW])), required: FIXED }, rows: { type: 'array', items: ROW }, regressions: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, path: { type: 'string' }, mainControl: { type: 'string' } }, required: ['item', 'path', 'mainControl'] } }, preExisting: { type: 'array', items: { type: 'string' } }, failures: { type: 'array', items: { type: 'string' } }, needsRuling: { type: 'array', items: ASK }, commentUrl: { type: 'string' } }, required: ['pass', 'sha', 'mainSha', 'distHash', 'specSeen', 'fixed', 'rows', 'regressions', 'preExisting', 'failures', 'needsRuling', 'commentUrl'] }
const BREAK = { type: 'object', properties: { sha: { type: 'string' }, defects: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, cls: { type: 'string' }, refutes: { type: 'string' }, steps: { type: 'string' }, expected: { type: 'string' }, observed: { type: 'string' }, evidence: { type: 'string' }, visitorPath: { type: 'boolean' }, mainResult: { type: 'string', enum: ['main-passes', 'main-fails-too', 'not-run'] }, mainControl: { type: 'string' } }, required: ['title', 'cls', 'refutes', 'steps', 'expected', 'observed', 'evidence', 'visitorPath', 'mainResult', 'mainControl'] } }, triedClean: { type: 'array', items: { type: 'string' } }, commentUrl: { type: 'string' } }, required: ['sha', 'defects', 'triedClean', 'commentUrl'] }
const JURY = { type: 'object', properties: { sha: { type: 'string' }, rows: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, score: { type: 'number' }, target: { type: 'number' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'score', 'target', 'evidence', 'fix'] } }, notes: { type: 'string' }, commentUrl: { type: 'string' } }, required: ['sha', 'rows', 'notes', 'commentUrl'] }
const MF = { type: 'object', properties: { key: { type: 'string' }, cls: { type: 'string', enum: CLASSES }, text: { type: 'string' }, citation: { type: 'string' }, repro: { type: 'string' }, mainControl: { type: 'string' }, oneTask: { type: 'boolean' } }, required: ['key', 'cls', 'text', 'citation', 'repro', 'mainControl', 'oneTask'] }
const QUEUED = { type: 'object', properties: { key: { type: 'string' }, text: { type: 'string' }, doneWhen: { type: 'string' } }, required: ['key', 'text', 'doneWhen'] }
const REVIEW = { type: 'object', properties: { verdict: { type: 'string', enum: ['approve', 'changes'] }, mustFixKind: { type: 'string', enum: ['code', 'evidence-only', 'none'] }, mustFix: { type: 'array', items: MF }, queued: { type: 'array', items: QUEUED }, breakerDispositions: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, disposition: { type: 'string', enum: ['must-fix', 'queue', 'refuted', 'duplicate'] }, reason: { type: 'string' } }, required: ['title', 'disposition', 'reason'] } }, needsRuling: { type: 'array', items: ASK }, specSeen: { type: 'string' }, notes: { type: 'string' }, commentUrl: { type: 'string' } }, required: ['verdict', 'mustFixKind', 'mustFix', 'queued', 'breakerDispositions', 'needsRuling', 'specSeen', 'notes', 'commentUrl'] }
const PERF = { type: 'object', properties: { sha: { type: 'string' }, state: { type: 'string', enum: ['done', 'blocked', 'orphaned', 'failed'] }, rows: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail', 'flake', 'blocked', 'skipped'] }, value: { type: 'string' }, budget: { type: 'string' }, evidence: { type: 'string' } }, required: ['id', 'status', 'value', 'budget', 'evidence'] } }, notes: { type: 'string' }, commentUrl: { type: 'string' } }, required: ['sha', 'state', 'rows', 'notes', 'commentUrl'] }
const INVEST = { type: 'object', properties: { sha: { type: 'string' }, mainSha: { type: 'string' }, rows: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, verdict: { type: 'string', enum: ['regression', 'pre-existing', 'inconclusive'] }, head: { type: 'string' }, main: { type: 'string' }, evidence: { type: 'string' } }, required: ['id', 'verdict', 'head', 'main', 'evidence'] } }, notes: { type: 'string' } }, required: ['sha', 'mainSha', 'rows', 'notes'] }

// ---- helpers -----------------------------------------------------------------------------------------------------
const sha7 = s => { const m = /^[0-9a-f]{7}/i.exec(String(s == null ? '' : s)); return m ? m[0].toLowerCase() : '' }
const sameSha = (a, b) => { const x = sha7(a), y = sha7(b); return !!x && !!y && x === y }
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v === undefined ? null : v)
const seal = o => { const s = canon(Object.assign({}, o, { check: undefined })); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16) + ':' + s.length }
const ret = (c, s) => { const r = Object.assign({ id: c.id, issue: c.issue, repo: c.repo }, s); r.check = seal(r); return r }
const trim = s => String(s == null ? '' : s).trim()
const slug = s => trim(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item'
// clip: a text cut to max chars with a visible marker, logged so the cut is never silent.
const clip = (what, text, max) => { const t = String(text); if (t.length <= max) return t; log(`${what}: cut from ${t.length} to ${max} chars`); return t.slice(0, max - 60) + ` [CUT at ${max} chars: the full text is on the PR]` }
const json = (what, v, max) => clip(what, JSON.stringify(v), max)
const normPath = f => trim(f).replace(/^"(.*)"$/, '$1').replace(/\\/g, '/').replace(/^\.\//, '')
const globRe = g => new RegExp('^' + g.split(/(\*\*\/|\*\*|\*|\?)/).map(x => x === '**/' ? '(?:.*/)?' : x === '**' ? '.*' : x === '*' ? '[^/]*' : x === '?' ? '[^/]' : x.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('') + '$')
const hits = (globs, files) => files.map(normPath).some(f => (globs || []).some(g => /[*?]/.test(g) ? globRe(normPath(g)).test(f) : f === normPath(g).replace(/\/+$/, '') || f.startsWith(normPath(g).replace(/\/+$/, '') + '/')))
const once = async (mk, t) => { const a = await mk(false); if (a) return a; log(`${t} returned null; retrying once`); return await mk(true) }
const notPassing = rows => (rows || []).filter(r => r.status !== 'pass' && r.status !== 'out-of-scope')

// ---- prompt blocks -----------------------------------------------------------------------------------------------
const fleetOf = c => c.fleet
const evDir = (c, round, role) => `${c.evidenceRoot}\\${c.id}\\<sha7>\\${role}-r${round}\\`
const prOf = (c, w) => (w && w.prUrl) || c.pr || `(the open PR for ${c.branch}: gh pr list -R ${c.repo} --head ${c.branch})`
const rulesBlock = (c, spec) => `OWNER AND REPO RULES (a summary; CLAUDE.md, docs/agents/PROTOCOL.md and docs/agents/blocks/rules.web.md win):
- Binding: the spec below, docs/agents/decisions.md (owner decisions win), docs/agents/north-star.md, docs/agents/owner-voice.md, docs/agents/budgets.md, and every **Orchestrator** comment on #${c.issue} or the PR posted after the spec (${spec.postedAt}). Read only those, never whole threads: gh api "repos/${c.repo}/issues/${c.issue}/comments?since=${spec.postedAt}" --jq '.[] | select(.body | test("^\\\\*\\\\*Orchestrator")) | {id, created_at, body}' and the same for the PR's number. A newer Orchestrator comment wins where it differs from the spec.
- Never invent owner facts: content/owner-facts.md is the only source; anything else is a visible [PLACEHOLDER: ...]. No AI-generated images. Free tools only; a new dependency needs a docs/agents/deps.md entry first.
- Edit only ${c.id}'s owned globs in docs/agents/ownership.json (code paths: ${c.codePaths.join(' ')}); outside them file a request issue (PROTOCOL section 5). Budgets in budgets.md are limits, not targets.
- Git: never push to main, never force-push, no Git LFS; commit messages end with a blank line and 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'. Every gh command takes -R ${c.repo} (gh api: the full repos/${c.repo}/... path). Run git as git -C <your worktree>. The main checkout ${c.mainCheckout} is read-only for you.
- ${WAIT_RULE.replace(/<fleet>/g, fleetOf(c))}
- HEAVY JOBS (PROTOCOL section 9): powershell -File ${fleetOf(c)}\\lane.ps1 status before each npm ci, build or browser suite; while another agent holds perf, start none of them (wait with waitfor.mjs, at most 45 min in all, then report the step blocked, blockedBy host). At most 2 browser suites and 2 builds machine-wide. Browsers muted: playwright-cli -s=<your role> open <url> --config C:\\Users\\Aaron\\AppData\\Local\\ion\\pwcli\\agent.config.json; close your session when done. Blender only on the GPU (blender_gpu.py first, the blender lane).
- BUILD ONCE: a verifier never runs npm ci or npm run build for a commit itself: node ${fleetOf(c)}\\build-once.mjs <sha> (call again while it exits 75) gives a tree with node_modules and dist; run harnesses and scripts/crew.mjs from that tree (their servers take port 0), never edit it, write evidence with --out, and run build-once.mjs <sha> --verify before you return a verdict that rests on it.
- EVIDENCE: under ${c.evidenceRoot}\\${c.id}\\<sha7>\\<your role>-r<round>\\ (pass --role <role>-r<round> and --out <that folder> to every harness and crew.mjs call that takes them).
- Skills and tools: load what helps (the animate, design-motion-principles, threejs-* and a11y skills; the Context7 MCP for library docs). References from anywhere: cite, never copy.`
const specBlock = (c, spec) => `SPEC ${spec.version} for ${c.id} (#${c.issue}; sha256 ${String(spec.sha256).slice(0, 12)}; posted ${spec.postedAt} as ${spec.commentUrl}; it folds every earlier Orchestrator comment on #${c.issue} and binds):
${spec.text}`
// The open-items digest (<= limits.digestChars) and the last verdict (<= limits.verdictChars): agents get these, never whole threads.
const digestOf = (c, fb, queued) => fb ? clip(`${c.id}: digest`, [
  `NOT APPROVED BECAUSE: ${(fb.blockers || []).join('; ') || 'must-fix after the perf queue'}`,
  `OPEN MUST-FIX (${fb.mustFix.length}; fix or prove each): ${fb.mustFix.map(m => `[${m.key} | ${m.cls}] ${clip(`${c.id}: digest item ${m.key}`, m.text, 260)}`).join(' ;; ') || 'none'}`,
  fb.asks.length ? `OPEN RULINGS: ${fb.asks.map(a => `${a.line}: ${a.question}`).join(' ;; ')}` : '',
  fb.jury ? `JURY (last round): ${fb.jury}` : '',
  fb.perf ? `PERF (last run): ${fb.perf}` : '',
  `QUEUED TO #91 (${queued.length}; not this crew's work unless a must-fix names it): ${queued.slice(-10).map(q => q.key).join(', ') || 'none'}`,
].filter(Boolean).join('\n'), c.limits.digestChars) : ''
const feedbackBlock = (c, round, fb, queued) => fb ? `ROUND ${round} FEEDBACK (the open-items digest; the judge's full verdict is ${fb.verdictUrl || 'its PR review comment'}):
${digestOf(c, fb, queued)}
LAST VERDICT: ${json(`${c.id}: last verdict`, fb.verdict, c.limits.verdictChars)}` : ''
const opts = (c, role, label, schema) => Object.assign({ label, phase: c.phase, schema }, c.models[role] && c.models[role].model ? { model: c.models[role].model } : {}, c.models[role] && c.models[role].effort ? { effort: c.models[role].effort } : {})
const L = (c, stage, round, extra) => stage === 'crew' ? `${c.id}#${round}${extra || ''}` : `${c.id}:${stage}#${round}${extra || ''}`

// ---- prompts -----------------------------------------------------------------------------------------------------
const crewPrompt = (c, spec, round, kind, fb, queued, o) => `ROLE: Crew ${c.id} for derprito64bit's portfolio, ROUND ${round}${kind === 'evidence' ? ' (EVIDENCE-ONLY: tests, evidence or PR text; change code only where a must-fix names it)' : ''}${o.h ? `, hand-off ${o.h}` : ''}.
MISSION: deliver #${c.issue} (${c.title}) to every row of the spec, at the owner's quality bar, with evidence that would FAIL if the feature were broken, as one PR on ${c.branch} that a functional gate, a breaker${c.jury.enabled ? ', a design/motion jury' : ''} and a judge accept.
${rulesBlock(c, spec)}
${specBlock(c, spec)}
${feedbackBlock(c, round, fb, queued)}
${o.handoff ? `HAND-OFF FROM THE PREVIOUS CREW AGENT OF THIS ROUND (it passed about ${c.handoff.tokens} tokens of context): ${clip(`${c.id}: hand-off`, o.handoff, 3000)}\nStart from it and the PR; do not redo finished work.\n` : ''}${o.retry ? 'An earlier attempt of this step died: read the PR, its last checkpoint and the branch before changing anything (PROTOCOL section 7).\n' : ''}PROCESS:
- Work in your own worktree (node scripts/crew.mjs open ${c.id.toLowerCase()} from the main checkout, or reuse it). Small commits, push after each step, a draft PR at the first push (--base main). A checkpoint comment on the PR at most every 30 minutes.
- Negative controls: every automated check you add or change, and every check that reports 0 hits, null or empty, must be shown to FAIL on a planted defect or on the pre-fix SHA; record it in the row's negative field ("n/a: <reason>" only for manual or visual rows). One instance of a defect class means fixing every instance in the diff; say how you enumerated them.
- Self-break before you mark the PR ready: rest past idle; a WebGL context loss and a thrown error mid-animation; Back, bfcache, reload and anchors; rapid input; resize and orientation mid-animation; reduced motion and no-WebGL; Chromium AND WebKit.
- A spec conflict you cannot settle: comment "RULING NEEDED (<row>): <question>; recommended: <default>" on the PR (gh pr comment <your PR> -R ${c.repo} --body-file <file>), report the row blocked (blockedBy ruling) and in needsRuling, and keep working on the rest.
- Timed rows (TBT, readable, GPU ratio) are measured once, by the perf queue at the approval candidate: never claim them passing; bytes are CI's size-limit.
- Before you return: npm run check passes in your worktree; push; node ${fleetOf(c)}\\waitfor.mjs checks <your PR> --repo ${c.repo} (again while it exits 75) shows every check green; gh pr ready <your PR> -R ${c.repo}; changedFiles = git -C <worktree> diff --name-only origin/main...HEAD.
- HAND-OFF: when your context passes about ${c.handoff.tokens} tokens, push, post a checkpoint, and return at once with handoff true and handoffNote (at most 3,000 chars: what is done, what is left, the next commands). A fresh agent continues this round.
OUTPUT: return the schema; facts with evidence paths or comment ids; specSeen names the spec version and the newest Orchestrator comment id you read.`

const gatePrompt = (c, spec, round, work, fb, queued, o) => `ROLE: Functional gate for crew ${c.id} (#${c.issue}, PR ${prOf(c, work)}), ROUND ${round}, at the head ${work.sha}.
MISSION: do not trust the crew. Re-run every spec row yourself at the head, in Chromium AND WebKit, prove each automated check can fail, and report a status per row with evidence. Never edit code. Your timed numbers are only the frame-count probes and ONE Lighthouse run; every other timed row belongs to the perf queue at the approval candidate.
${rulesBlock(c, spec)}
${specBlock(c, spec)}
${feedbackBlock(c, round, fb, queued)}
CREW REPORT: ${json(`${c.id} gate#${round}: crew`, { sha: work.sha, prUrl: work.prUrl, notPassing: notPassing(work.acceptance), acceptance: work.acceptance, knownIssues: work.knownIssues, needsRuling: work.needsRuling, changedFiles: work.changedFiles }, 6000)}
${o.retry ? `An earlier gate attempt in this round died: ${evDir(c, round, 'gate')} may hold its results; re-verify each before reuse.\n` : ''}BUILDS: the head through build-once.mjs ${sha7(work.sha)}; main through build-once.mjs origin/main (for every main control); the merge tree: git -C <a worktree> merge-tree --write-tree origin/main ${sha7(work.sha)}, then git commit-tree <that tree> -p origin/main -p ${sha7(work.sha)} -m merge-check, then build-once.mjs <that commit> and npm run check -- --skip build from its tree.
FIXED ROWS (fixed.<key>; every one required, out-of-scope counts as not passing):
- ci: node ${fleetOf(c)}\\waitfor.mjs checks ${prOf(c, work)} --repo ${c.repo} (again while it exits 75), then gh run view <run> -R ${c.repo} --json jobs: every job step green at the head; a skipped step that tests this PR's paths is a fail.
- mergeTree: the merge tree builds and npm run check passes on it; mainSha is origin/main's SHA.
- visual: your own shots of every view the spec names (light and dark; D2, P2 and WebKit), looked at one by one; never the crew's images.
- text, targets, focusRing, flash: budgets.md's floors (text >= 12 px, targets >= 44x44 px, focus ring at every Tab stop, WCAG 2.3.1 flash analysis) on every route the PR renders or changes and on /, each with its own planted negative control. ${c.gate.floors}
- frames: the deterministic frame-count probes, 3 runs each: ${c.gate.frames}
- lighthouse: ONE Lighthouse run of the built / (mobile): the LCP element and CLS against budgets.md (TBT is the perf queue's). A host-suspect run (crew.mjs reports blocked) is rerun once; if it stays blocked, the row is blocked (host).
REGRESSIONS VS MAIN: for every default visitor path the diff can reach (${c.gate.visitorPaths}), a check that fails at the head but passes on the main build is a regression: the row fails and regressions[] names it with its mainControl (the main run's evidence). A check main fails too is pre-existing: list it in preExisting, never as this PR's fail.
ROW STATUS: pass | fail | blocked (blockedBy host, ruling or dependency) | out-of-scope (cite the spec). A row passes only with evidence and a working negative control for every automated check that is new, changed, or reported 0, null or empty; build the control yourself when the crew's is missing. An ambiguous spec row fails closed: blocked (ruling) plus a needsRuling entry, never pass. pass is true only when every fixed row and every spec row is pass (out-of-scope only where the spec allows it) and failures is empty.
Post ONE PR comment (gh pr comment ${prOf(c, work)} -R ${c.repo} --body-file <file>) starting "Gate round ${round} at <sha7>:" with a status table. Evidence under ${evDir(c, round, 'gate')}. Close your browsers and remove your worktree. Return the schema with distHash from build-once.mjs --verify.`

const breakPrompt = (c, spec, round, work, fb, queued, pass, passes, found) => `ROLE: Breaker, pass ${pass} of ${passes}, for crew ${c.id} (#${c.issue}, PR ${prOf(c, work)}), ROUND ${round}, at the head ${work.sha}. TIME BOX: ${c.breaker.timeboxMin} minutes of work, then report.
MISSION: do not confirm anything. Make the head fail a spec row, a locked decision or a budget that the crew reports as passing. Scope: what the diff changed (${clip(`${c.id} break: files`, (work.changedFiles || []).join(' '), 1500)}) and the default visitor paths it can reach (${c.gate.visitorPaths}). Never edit the PR. No timed verdicts: a frame or timing result seen while other agents run is never a fail; name it in triedClean as information.
${rulesBlock(c, spec)}
${specBlock(c, spec)}
${feedbackBlock(c, round, fb, queued)}
CHECKLIST (your own detached worktree or the build-once tree, your own muted playwright-cli session -s=${c.id.toLowerCase()}-break${pass}): rest past idle; a WebGL context loss and a thrown error mid-animation; Back, bfcache, reload and anchors; rapid and repeated input; resize and orientation mid-animation; reduced motion and no-WebGL; each in Chromium AND WebKit. ${c.breaker.how}
Re-test each OPEN MUST-FIX in the digest first and list each that holds in triedClean as "<its key> :: <evidence>".
${found.length ? `ALREADY FOUND THIS ROUND (do not report again; find what else breaks, including other instances of these classes): ${clip(`${c.id} break: found`, found.join(' ;; '), 4000)}\n` : ''}EACH DEFECT: exact steps, expected (cite the row, decision or budget), observed, evidence path, class, and every other instance of that class. visitorPath: is it on a default visitor path? mainResult and mainControl: run the same steps on the main build (build-once.mjs origin/main): main-passes (a regression; mainControl is that run's evidence), main-fails-too (pre-existing) or not-run (say why in mainControl). Only a main-passes defect on a visitor path can block without the judge.
Post ONE PR comment (gh pr comment ${prOf(c, work)} -R ${c.repo} --body-file <file>) starting "Breaker ${round}.${pass} at <sha7>:". Evidence under ${evDir(c, round, `break${pass}`)}. Close your session and remove your worktree. Return the schema.`

const juryPrompt = (c, spec, round, work, fb, queued) => `ROLE: Design and motion jury for slice ${c.id} (#${c.issue}, PR ${prOf(c, work)}), ROUND ${round}, at the head ${work.sha}.
MISSION: score the head against the owner's quality bar: "the quality of animation and layout of portfolio-zxc and Jesper Landberg, never their look" (docs/agents/owner-voice.md and docs/agents/north-star.md). Your rows come from the motion benchmark (${c.jury.benchmark}); read its scale and references first. A row below its target is a must-fix: you have the power to block, so score honestly and make every fix buildable. Never edit code.
${rulesBlock(c, spec)}
${specBlock(c, spec)}
${feedbackBlock(c, round, fb, queued)}
ROWS (id: row, target out of 10): ${c.jury.rows.map(r => `${r.id}: ${r.row} (target ${r.target})`).join(' ;; ')}
HOW: on the build-once tree of the head, record each motion yourself (stepped frames through __stage.seek and document.getAnimations(), or a playwright-cli screencast) at D2 and P2, light and dark, and once in WebKit; look at every recording frame by frame, and at rest. Compare with main where the row existed before. Score 0 to 10 per row against the benchmark's references and scale; evidence names the recordings. For each row below target, fix names what to change, where (file and token) and the expected effect, in one or two sentences.
Post ONE PR comment (gh pr comment ${prOf(c, work)} -R ${c.repo} --body-file <file>) starting "Jury round ${round} at <sha7>:" with the score table. Evidence under ${evDir(c, round, 'jury')}. Close your browsers. Return the schema.`

const judgePrompt = (c, spec, round, work, g, fb, queued, hist) => `ROLE: Judge for crew ${c.id} (#${c.issue}, PR ${prOf(c, work)}), ROUND ${round}, at the head ${work.sha}.
MISSION: decide whether the PR can merge, under the owner's pre-launch must-fix taxonomy. Not a rubber stamp, and not noise.
${rulesBlock(c, spec)}
${specBlock(c, spec)}
${feedbackBlock(c, round, fb, queued)}
TAXONOMY (binding). The owner's decision, quoted word for word (${c.mustFix.rulingUrl}): "${c.mustFix.ruling}"
PLAN.md's operating model, item 2 (the pre-launch taxonomy), quoted word for word: ${c.mustFix.taxonomy.map(t => `${t.label}: "${t.quote}"`).join(' ')}
MUST-FIX ITEMS (mustFix): key (a stable slug; reuse last round's key for the same defect), cls (acceptance | regression | budget | design | rare-edge), text, citation (the spec row id, decision, budget or jury row), repro (your own confirmation: file:line or your probe), mainControl (for a regression: the main-SHA control showing main passes), oneTask (for rare-edge: true only when the fix is at most one crew task with no new harness). loop() moves an item that lacks its proof to the #91 queue: a regression without a main control, a rare-edge item without oneTask true, an acceptance or design item without a citation, and any budget item (only the perf queue raises those).
QUEUE (queued): everything else, each with a doneWhen line: anything pre-existing on main, tooling hardening, single-run flakes, should-fixes, and taste beyond the jury's rows. A should-fix never becomes a must-fix because it recurs.
BREAKER: give each breaker defect exactly one breakerDispositions entry: must-fix (also in mustFix), queue (also in queued), refuted (your reproduction failed; say what you ran) or duplicate (name the original).
${c.jury.enabled ? 'JURY: every jury row below its target is a must-fix (cls design, citation the row); loop() adds any you leave out.\n' : ''}A BUSY HOST means blocked, rerun: never "cannot approve" and never a fail.
READ: the PR diff (gh pr diff ${prOf(c, work)} -R ${c.repo}), the stage reports below, the stage comments at this head, the Orchestrator comments newer than the spec.
STAGES: ${json(`${c.id} judge#${round}: stages`, g, 14000)}
HISTORY (earlier rounds, newest first): ${json(`${c.id} judge#${round}: history`, [...hist].reverse().map(h => ({ round: h.round, kind: h.kind, head: sha7(h.head), verdict: h.verdict, mustFix: h.mustFix, queued: h.queuedAdded })), 4000)}
needsRuling: every question still open after you read the newest Orchestrator comments (from the crew, the gate and you); drop one only when an Orchestrator comment answers it, and cite its id in notes.
VERDICT: approve only when the gate passed (every fixed row pass, every spec row pass or allowed out-of-scope, no failures), mustFix is empty and needsRuling is empty. Post it with gh pr review ${prOf(c, work)} -R ${c.repo} --comment --body-file <file> (must-fix with citations, then the queue), and set the labels (gh pr edit ${prOf(c, work)} -R ${c.repo} --add-label review:approved --remove-label review:changes-requested, or the reverse). commentUrl is that review's URL. Return the schema.`

const perfPrompt = (c, spec, round, work, sets, o) => `ROLE: Perf queue reader for crew ${c.id} (#${c.issue}, PR ${prOf(c, work)}), ROUND ${round}, at the approval candidate ${work.sha}.
MISSION: run the timed rows once, from the detached queue, and report them against docs/agents/budgets.md (its json budgets block first). You never measure by hand, and no call of yours blocks longer than 270 s.
${WAIT_RULE.replace(/<fleet>/g, fleetOf(c))}
Every gh command takes -R ${c.repo}. Never edit code, never start a build or a browser yourself while the queue runs.
${o.retry ? 'An earlier reader of this step died: its queue may still be running or finished; perfq.mjs status --out <the folder below> first, and start again (it resumes from finished sets) only if it is not running.\n' : ''}STEPS:
1. node ${fleetOf(c)}\\build-once.mjs ${work.sha} (again while it exits 75); note the tree it prints.
2. Write ${c.evidenceRoot}\\${c.id}\\${sha7(work.sha)}\\perf-r${round}\\plan.json: ${json(`${c.id} perf#${round}: plan`, { sha: work.sha, tree: '<the build-once tree>', heartbeatMin: c.perf.heartbeatMin, busyWaitMin: c.perf.busyWaitMin, sets }, 6000)}
3. node ${fleetOf(c)}\\perfq.mjs start --plan <that plan.json> --out ${c.evidenceRoot}\\${c.id}\\${sha7(work.sha)}\\perf-r${round}\\queue --agent ${c.id.toLowerCase()}-perf-r${round}
4. node ${fleetOf(c)}\\perfq.mjs wait --out <that queue folder>, again and again while it exits 75. Each call is the queue's heartbeat: if you stop calling it for ${c.perf.heartbeatMin} minutes the queue kills its set and stops (orphaned).
5. When it ends, read status.json and every set's outputs; give one row per set: pass, fail (reproduced in a second clean set), flake (it did not reproduce: a single-set flake, queued, never a must-fix), blocked (the host stayed busy: blocked, rerun) or skipped; value (median, runs, worst run) and budget (the budgets.md number and its tolerance), evidence (files, with the hostload files).
6. state: done when every set ended pass, fail, flake or skipped; blocked when any set is blocked; orphaned or failed as the queue says.
Post ONE PR comment (gh pr comment ${prOf(c, work)} -R ${c.repo} --body-file <file>) starting "Perf queue at <sha7>:" with the table. Return the schema.`

const investPrompt = (c, spec, round, work, perf, sets) => `ROLE: Perf investigator for crew ${c.id} (#${c.issue}, PR ${prOf(c, work)}), ROUND ${round}.
MISSION: each row below failed at ${work.sha} and reproduced in a second clean set. Decide for each whether it is this PR's regression or pre-existing on main, from a main control.
${WAIT_RULE.replace(/<fleet>/g, fleetOf(c))}
FAILED ROWS: ${json(`${c.id} invest#${round}: rows`, perf.rows.filter(r => r.status === 'fail'), 3000)}
THEIR SETS: ${json(`${c.id} invest#${round}: sets`, sets, 4000)}
STEPS: node ${fleetOf(c)}\\build-once.mjs origin/main (again while it exits 75); write a plan.json with those sets, the main SHA and the main tree; node ${fleetOf(c)}\\perfq.mjs start --plan <it> --out ${c.evidenceRoot}\\${c.id}\\${sha7(work.sha)}\\invest-r${round}\\main-queue --agent ${c.id.toLowerCase()}-invest-r${round}; perfq.mjs wait (again while it exits 75: it is the queue's heartbeat). Per row: regression when main is within the budget (or better than the head beyond the row's tolerance) and the head is not; pre-existing when main breaches it too; inconclusive when main's set is blocked (say so).
Post ONE PR comment (gh pr comment ${prOf(c, work)} -R ${c.repo} --body-file <file>) starting "Perf investigation round ${round}:". Return the schema.`

// ---- the loop's own rules ----------------------------------------------------------------------------------------
const gatePassed = gate => gate.pass === true && !(gate.failures || []).length && FIXED.every(k => gate.fixed && gate.fixed[k] && gate.fixed[k].status === 'pass') && !notPassing(gate.rows).length && (gate.rows || []).some(r => r.status === 'pass')
// What a must-fix item lacks under the taxonomy ('' when it may block).
const missingProof = (c, m) => !CLASSES.includes(m.cls) ? `an unknown class '${m.cls}'`
  : m.cls === 'acceptance' ? (trim(m.citation) ? '' : 'no citation of a spec row')
  : m.cls === 'regression' ? (trim(m.mainControl) ? '' : 'a regression with no main-SHA control') /*R:regressionControl*/
  : m.cls === 'rare-edge' ? (m.oneTask === true ? '' : 'a rare-edge item whose fix is more than one crew task') /*R:rareEdge*/
  : m.cls === 'design' ? (c.jury.enabled && trim(m.citation) ? '' : 'a design item with no jury row (or no jury on this crew)')
  : m.addedBy === 'perf' ? '' : 'a budget item not raised by a reproduced timed fail' /*R:budgetFromPerf*/

function tally(c, round, work, gate, breaks, jury, review) {
  const items = [], queued = [], notes = []
  const queue = (key, text, doneWhen, from) => queued.push({ key, text: clip(`${c.id}: queued ${key}`, text, 600), doneWhen, from })
  for (const m of review.mustFix || []) {
    const why = missingProof(c, m)
    if (why) { queue(m.key, m.text, `prove it under the taxonomy or fix it later: ${why}`, `judge round ${round}`); notes.push(`must-fix ${m.key} moved to the #91 queue: ${why}`) } else items.push(m)
  }
  for (const q of review.queued || []) queue(q.key, q.text, q.doneWhen, `judge round ${round}`)
  // A breaker defect the judge left without a disposition: a proven regression on a visitor path blocks, the rest is queued.
  const disposed = t => (review.breakerDispositions || []).some(d => d.title === t)
  for (const d of breaks.flatMap(b => b.defects || []).filter(d => !disposed(d.title))) {
    const key = `break-${slug(d.title)}`
    if (d.visitorPath && d.mainResult === 'main-passes' && trim(d.mainControl)) { if (!items.some(m => m.key === key)) items.push({ key, cls: 'regression', text: `${d.title}: ${d.observed}`, citation: d.expected, repro: d.evidence, mainControl: d.mainControl, oneTask: false, addedBy: 'loop' }) } /*R:breakerRegression*/
    else queue(key, d.title, 'the judge disposes it, or it is fixed', `breaker round ${round}, undisposed`)
    notes.push(`breaker defect '${d.title}' was left undisposed by the judge`)
  }
  if (c.jury.enabled) {
    for (const row of c.jury.rows) {
      const r = ((jury && jury.rows) || []).find(x => x.id === row.id)
      const key = `design-${slug(row.id)}`
      if (r && Number(r.score) >= Number(row.target)) continue
      if (items.some(m => m.key === key || (m.cls === 'design' && String(m.citation).includes(row.id)))) continue
      items.push({ key, cls: 'design', text: r ? `jury row ${row.id} scored ${r.score} < target ${row.target}: ${r.fix}` : `jury row ${row.id} has no score at this head`, citation: `jury row ${row.id}: ${row.row}`, repro: r ? r.evidence : 'no jury score', mainControl: '', oneTask: false, addedBy: 'loop' }) /*R:jury*/
    }
  }
  return { items, queued, notes }
}

function validatePrior(o, c) {
  if (!o || !Object.keys(o).length) return
  if (o.id !== c.id || o.issue !== c.issue || o.repo !== c.repo) throw new Error(`crew-loop: the prior is for ${o.id} #${o.issue}, not ${c.id} #${c.issue}`)
  if (o.check !== seal(o)) throw new Error('crew-loop: the prior does not match its seal (it was edited or retyped); rebuild it with prior-from-journal.cjs')
  if (o.status === 'approved') throw new Error('crew-loop: the prior is an approved run; there is nothing to continue')
}

function validate(c, spec) {
  for (const k of ['id', 'issue', 'repo', 'branch', 'title', 'phase', 'codePaths', 'evidenceRoot', 'fleet', 'mainCheckout', 'caps', 'stopEarly', 'breaker', 'jury', 'perf', 'gate', 'models', 'handoff', 'limits', 'mustFix', 'hardStop']) if (c[k] === undefined || c[k] === null || c[k] === '') throw new Error(`crew-loop: the config lacks ${k}`)
  if (!Number.isInteger(c.caps.code) || !Number.isInteger(c.caps.evidence)) throw new Error('crew-loop: caps.code and caps.evidence must be whole numbers')
  if (c.jury.enabled && !(c.jury.rows || []).length) throw new Error('crew-loop: a jury needs rows')
  if (!trim(c.mustFix.ruling) || !(c.mustFix.taxonomy || []).length) throw new Error('crew-loop: mustFix needs the ruling and the taxonomy quotes')
  for (const k of ['version', 'sha256', 'postedAt', 'commentUrl', 'text']) if (!trim(spec && spec[k])) throw new Error(`crew-loop: the spec lacks ${k}`)
  if (spec.text.length > c.limits.specChars) throw new Error(`crew-loop: the spec is ${spec.text.length} chars, over limits.specChars ${c.limits.specChars}`) /*R:specLimit*/
}

// ---- the loop ----------------------------------------------------------------------------------------------------
async function loop(c, spec, o, newGrant) {
  validatePrior(o, c)
  const grant = {}
  for (const k of ['code', 'evidence']) { const n = ((o.grant && o.grant[k]) || 0) + ((newGrant && newGrant[k]) || 0); if (n) grant[k] = n }
  const cap = { code: c.caps.code + (grant.code || 0), evidence: c.caps.evidence + (grant.evidence || 0) }
  log(`${c.id}: caps code ${cap.code}, evidence ${cap.evidence}${Object.keys(grant).length ? ` (with grant ${JSON.stringify(grant)})` : ''}; spec ${spec.version}`)
  const hist = o.hist || []
  let round = o.round || 1, work = o.work || null, fb = o.fb || null, queued = o.queued || [], perfAt = o.perfAt || null
  let resume = o.resume || null, stage = o.stage || {}, pendingKind = o.pendingKind || null
  const count = k => hist.filter(h => h.kind === k).length
  const summary = () => hist.map(h => `round ${h.round} (${h.kind}) at ${sha7(h.head)}: ${h.verdict}, ${h.mustFixCount} must-fix${h.mustFix.length ? ` [${h.mustFix.join(', ')}]` : ''}${h.perf ? `; perf ${h.perf}` : ''}`)
  const snap = extra => ret(c, Object.assign({ round, work, fb, hist, queued, perfAt, grant, spec: spec.version }, extra))
  // Crews never force-push, so a crew head never returns to an earlier round's commit (the immediately previous head may repeat).
  const regressed = s => { const prev = hist[hist.length - 1]; if (!prev || sameSha(s, prev.head)) return null; const h = hist.slice(0, -1).find(x => sameSha(s, x.head)); return h ? h.round : null }
  for (; round <= c.hardStop; round++) {
    const kind = pendingKind || (fb ? fb.nextKind : 'code')
    const at = resume ? ORDER.indexOf(resume) : 0
    if (!resume && count(kind) >= cap[kind]) { log(`${c.id}: the ${kind} cap (${cap[kind]}) is reached`); return snap({ status: 'cap', nextKind: kind, summary: summary() }) } /*R:cap*/
    let gate = stage.gate || null, breaks = stage.breaks || [], breakDone = !!stage.breakDone, jury = stage.jury || null, review = stage.review || null, perf = stage.perf || null
    // Reruns of a step after a busy host get their own label (g1, p1, ...), so every attempt's label is unique.
    const tries = stage.tries || {}
    const gx = tries.gate ? `g${tries.gate}` : '', px = tries.perf ? `p${tries.perf}` : ''
    pendingKind = null; resume = null; stage = {}
    const died = (status, step, st) => snap({ status, resume: step, pendingKind: kind, stage: st })

    // 1. The crew, with hand-offs when its context grows past about handoff.tokens.
    if (at <= 0) {
      work = await once(r => agent(crewPrompt(c, spec, round, kind, fb, queued, { retry: r }), opts(c, 'crew', L(c, 'crew', round, r ? 'r' : ''), CREW)), L(c, 'crew', round))
      for (let h = 1; work && work.handoff && h <= c.handoff.max; h++) { /*R:handoff*/
        log(`${c.id}: round ${round}: the crew handed off (${h} of ${c.handoff.max}); a fresh crew agent continues`)
        const note = work.handoffNote
        work = await once(r => agent(crewPrompt(c, spec, round, kind, fb, queued, { retry: r, handoff: note, h }), opts(c, 'crew', L(c, 'crew', round, `h${h}${r ? 'r' : ''}`), CREW)), L(c, 'crew', round, `h${h}`))
      }
      if (!work) return died('crew-died', 'crew', {})
      if (work.handoff) log(`${c.id}: round ${round}: the hand-off cap (${c.handoff.max}) is reached; the last crew report counts as final`)
    }
    const back = regressed(work.sha)
    if (back) { log(`${c.id}: round ${round}: the crew head ${work.sha} is round ${back}'s head (force-push is forbidden); escalating`); return snap({ status: 'escalate', reason: `head returned to round ${back}'s commit` }) }

    // 2. Gate, breaker passes and (slices) the jury, in parallel; a resumed step keeps what finished.
    const files = work.changedFiles || []
    const passes = Math.min(c.breaker.maxPasses, c.breaker.passes + (hits(c.breaker.extraPassGlobs, files) ? 1 : 0)) /*R:breakerPasses*/
    if (at <= 1) {
      const [g, b, j] = await parallel([
        () => gate ? Promise.resolve(gate) : once(r => agent(gatePrompt(c, spec, round, work, fb, queued, { retry: r }), opts(c, 'gate', L(c, 'gate', round, gx + (r ? 'r' : '')), GATE)), L(c, 'gate', round, gx)),
        async () => {
          if (breakDone) return { passes: breaks, done: true }
          const out = [...breaks]
          for (let p = out.length + 1; p <= passes; p++) {
            const found = out.flatMap(x => (x.defects || []).map(d => `${d.title} (${d.cls})`))
            const r = await once(rr => agent(breakPrompt(c, spec, round, work, fb, queued, p, passes, found), opts(c, 'breaker', L(c, 'break', round, `.${p}${rr ? 'r' : ''}`), BREAK)), L(c, 'break', round, `.${p}`))
            if (!r) return { passes: out, done: false }
            out.push(r)
          }
          return { passes: out, done: true }
        },
        () => !c.jury.enabled || jury ? Promise.resolve(jury) : once(r => agent(juryPrompt(c, spec, round, work, fb, queued), opts(c, 'jury', L(c, 'jury', round, r ? 'r' : ''), JURY)), L(c, 'jury', round)),
      ])
      gate = g || null
      if (b) { breaks = b.passes; breakDone = b.done } else breakDone = false
      jury = j || null
      if (!gate || !breakDone || (c.jury.enabled && !jury)) return died(!gate ? 'gate-died' : !breakDone ? 'breaker-died' : 'jury-died', 'verify', { gate, breaks, breakDone, jury, tries })
    }
    // A busy host means blocked, rerun: a gate whose only non-passing rows are blocked by the host reruns later, alone.
    const gateRows = [...FIXED.map(k => gate.fixed && gate.fixed[k]).filter(Boolean), ...(gate.rows || [])]
    const hostOnly = notPassing(gateRows).length > 0 && notPassing(gateRows).every(r => r.status === 'blocked' && r.blockedBy === 'host')
    if (hostOnly) { log(`${c.id}: round ${round}: the gate is blocked by a busy host (${notPassing(gateRows).map(r => r.item).join('; ')}): blocked, rerun`); return snap({ status: 'host-blocked', resume: 'verify', pendingKind: kind, stage: { gate: null, breaks, breakDone, jury, tries: Object.assign({}, tries, { gate: (tries.gate || 0) + 1 }) }, blocked: notPassing(gateRows).map(r => r.item) }) } /*R:busyHostGate*/

    // 3. The judge.
    const stages = { crew: { sha: work.sha, notPassing: notPassing(work.acceptance), needsRuling: work.needsRuling, knownIssues: work.knownIssues }, gate: { pass: gate.pass, sha: gate.sha, notPassing: notPassing(gateRows), failures: gate.failures, regressions: gate.regressions, preExisting: gate.preExisting, needsRuling: gate.needsRuling, commentUrl: gate.commentUrl }, breakers: breaks.map(b => ({ sha: b.sha, defects: b.defects, triedClean: b.triedClean, commentUrl: b.commentUrl })), jury: jury ? { sha: jury.sha, rows: jury.rows, notes: jury.notes, commentUrl: jury.commentUrl } : null }
    if (at <= 2 || !review) {
      review = await once(r => agent(judgePrompt(c, spec, round, work, stages, fb, queued, hist), opts(c, 'judge', L(c, 'judge', round, r ? 'r' : ''), REVIEW)), L(c, 'judge', round))
      if (!review) return died('judge-died', 'judge', { gate, breaks, breakDone: true, jury, tries })
    }
    const t = tally(c, round, work, gate, breaks, jury, review)
    for (const n of t.notes) log(`${c.id}: round ${round}: ${n}`)
    const asks = review.needsRuling || []
    const shaOk = [gate.sha, ...breaks.map(b => b.sha), ...(jury ? [jury.sha] : [])].every(s => sameSha(s, work.sha))
    const blockers = [
      [!gatePassed(gate), 'the gate did not pass'],
      [!shaOk, 'a stage SHA differs from the crew head'],
      // A changes verdict blocks through its must-fix items (which the taxonomy may move to the queue); one with none blocks as given.
      [review.verdict !== 'approve' && !(review.mustFix || []).length, `the judge's verdict is ${review.verdict} with no must-fix item`], /*R:verdict*/
      [t.items.length, `${t.items.length} must-fix`],
      [asks.length, `${asks.length} ruling(s) open`],
    ].filter(x => x[0]).map(x => x[1])

    // 4. Timed rows once, at the approval candidate, for the sets the diff can reach.
    let perfNote = null
    if (!blockers.length) {
      const sets = (c.perf.sets || []).filter(s => !s.paths || hits(s.paths, files)) /*R:perfScope*/
      const skipped = (c.perf.sets || []).filter(s => !sets.includes(s)).map(s => s.id)
      if (skipped.length) log(`${c.id}: round ${round}: perf sets the diff cannot reach, not run: ${skipped.join(', ')}`)
      if (sets.length && !sameSha(perfAt, work.sha)) {
        if (!perf) perf = await once(r => agent(perfPrompt(c, spec, round, work, sets, { retry: r || !!px }), opts(c, 'perf', L(c, 'perf', round, px + (r ? 'r' : '')), PERF)), L(c, 'perf', round, px))
        if (!perf) return died('perf-died', 'perf', { gate, breaks, breakDone: true, jury, review, tries })
        if (perf.state !== 'done') { log(`${c.id}: round ${round}: the perf queue ended ${perf.state}: blocked, rerun`); return snap({ status: 'host-blocked', resume: 'perf', pendingKind: kind, stage: { gate, breaks, breakDone: true, jury, review, tries: Object.assign({}, tries, { perf: (tries.perf || 0) + 1 }) }, blocked: (perf.rows || []).filter(r => r.status === 'blocked').map(r => r.id) }) } /*R:busyHostPerf*/
        for (const r of perf.rows.filter(x => x.status === 'flake')) t.queued.push({ key: `perf-flake-${slug(r.id)}`, text: `${r.id} failed once and did not reproduce: ${r.value} vs ${r.budget}`, doneWhen: 'it passes in the pre-G3a perf run', from: `perf round ${round}` })
        const fails = perf.rows.filter(x => x.status === 'fail')
        if (fails.length) {
          const inv = await once(r => agent(investPrompt(c, spec, round, work, perf, sets.filter(s => fails.some(f => f.id === s.id))), opts(c, 'invest', L(c, 'invest', round, px + (r ? 'r' : '')), INVEST)), L(c, 'invest', round, px))
          if (!inv) return died('invest-died', 'perf', { gate, breaks, breakDone: true, jury, review, perf, tries })
          for (const f of fails) {
            const v = (inv.rows || []).find(x => x.id === f.id)
            if (v && v.verdict === 'pre-existing') t.queued.push({ key: `perf-main-${slug(f.id)}`, text: `${f.id} breaches on main too: head ${v.head}, main ${v.main}`, doneWhen: 'a crew that owns it fixes it', from: `perf round ${round}` }) /*R:perfPreExisting*/
            else t.items.push({ key: `budget-${slug(f.id)}`, cls: 'budget', text: `${f.id}: ${f.value} against ${f.budget}, reproduced in a second clean set${v ? `; main ${v.main} (${v.verdict})` : ''}`, citation: f.budget, repro: f.evidence, mainControl: v ? v.evidence : '', oneTask: false, addedBy: 'perf' })
          }
        }
        perfNote = perf.rows.map(r => `${r.id} ${r.status}`).join(', ')
        if (!t.items.length) perfAt = work.sha
      }
    }

    const approved = !blockers.length && !t.items.length
    queued = [...queued, ...t.queued.filter(q => !queued.some(x => x.key === q.key))]
    hist.push({ round, kind, head: work.sha, verdict: review.verdict, mustFixCount: t.items.length, mustFix: t.items.map(m => `${m.key}|${m.cls}`), queuedAdded: t.queued.map(q => q.key), asks: asks.map(a => a.line), blockers, jury: jury ? jury.rows.map(r => `${r.id} ${r.score}/${r.target}`).join(', ') : null, perf: perfNote, spec: spec.version })
    log(`${c.id}: round ${round} judged at ${sha7(work.sha)}: ${approved ? 'APPROVED' : `not approved (${[...blockers, ...(blockers.length ? [] : [`${t.items.length} must-fix after perf`])].join('; ')})`}; ${t.items.length} must-fix, ${t.queued.length} queued`)
    if (approved) return snap({ status: 'approved', head: work.sha, prUrl: work.prUrl, mainSha: gate.mainSha, summary: summary() })

    const isCode = m => m.cls !== 'acceptance' || review.mustFixKind === 'code'
    const nextKind = t.items.some(isCode) || !t.items.length ? 'code' : 'evidence'
    fb = { mustFix: t.items.map(m => ({ key: m.key, cls: m.cls, text: m.text, citation: m.citation })), blockers, asks, jury: jury ? jury.rows.filter(r => r.score < r.target).map(r => `${r.id} ${r.score}/${r.target}: ${r.fix}`).join(' ;; ') : '', perf: perfNote, nextKind, verdictUrl: review.commentUrl, verdict: { verdict: review.verdict, mustFix: t.items.map(m => ({ key: m.key, cls: m.cls, text: m.text, citation: m.citation, repro: m.repro })), notes: clip(`${c.id}: verdict notes`, review.notes, 1500), commentUrl: review.commentUrl } }
    // A ruling the crew cannot work around ends the run; one beside code must-fix is carried for a round, then ends it.
    const prevAsks = hist.length > 1 ? hist[hist.length - 2].asks : []
    if (asks.length && (!t.items.some(isCode) || asks.some(a => prevAsks.includes(a.line)))) return snap({ status: 'needs-ruling', round: round + 1, asks, summary: summary() }) /*R:ruling*/
    // Stop early when the must-fix count has not fallen for stopEarly.flatRounds rounds.
    const n = c.stopEarly.flatRounds
    const last = hist.slice(-(n + 1)).map(h => h.mustFixCount)
    if (n > 0 && last.length === n + 1 && last.every((x, i) => i === 0 || x >= last[i - 1])) { log(`${c.id}: the must-fix count has not fallen for ${n} rounds (${last.join(', ')}): stopping early`); return snap({ status: 'stalled', round: round + 1, nextKind, summary: summary() }) } /*R:stopEarly*/
  }
  log(`${c.id}: hard stop after ${c.hardStop} rounds`)
  return snap({ status: 'escalate', reason: 'hard stop', summary: summary() })
}

// A file launch.mjs or prior-from-journal.cjs wrote is this template plus ONE appended line declaring EMBEDDED_ARGS
// (hoisted, so callable here although it sits after the final return). Launch it with no args.
if (typeof EMBEDDED_ARGS !== 'function') throw new Error('crew-loop: launch the file launch.mjs wrote (it embeds the config and the spec); this template takes no args')
if (args && typeof args === 'object' && Object.keys(args).length) throw new Error('crew-loop: this file carries its own args (EMBEDDED_ARGS); launch it with no args')
const run = EMBEDDED_ARGS()
validate(run.cfg, run.spec)
return await loop(run.cfg, run.spec, run.prior || {}, run.grant)
