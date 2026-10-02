#!/usr/bin/env bash
# Sets up the fleet's GitHub coordination layer in both portfolio repos:
#   - the labels from docs/agents/PROTOCOL.md (created, or updated when the colour or description differs);
#   - one milestone per wave (created only when missing);
#   - issues enabled on the fork.
# It reads the current state first and writes only what differs, so a second run makes no writes.
# Writes are spaced out and retried with backoff on GitHub's secondary rate limits (HTTP 403/429).
#
# Usage (Git Bash, gh logged in):  scripts/fleet/bootstrap-github.sh [--dry-run]
set -euo pipefail

REPOS=(derprito64bit/portfolio-site derprito64bit/derprito64bit.github.io)
FORK=derprito64bit/derprito64bit.github.io

DRY_RUN=0
case "${1:-}" in
  --dry-run) DRY_RUN=1 ;;
  "") ;;
  *) echo "usage: $0 [--dry-run]" >&2; exit 2 ;;
esac

# name|colour|description. One colour per family; status and review colours carry meaning.
LABELS=(
  "track:W|0052cc|Track W: the 2D site (portfolio-site)"
  "track:M|0052cc|Track M: the Unity Manor (fork)"
  "track:G|0052cc|Track G: Painting Worlds (fork)"
  "track:S|0052cc|Track S: shared identity, content, tooling and release"
  "wave:0|c5def5|Wave 0: setup"
  "wave:0.5|c5def5|Wave 0.5: north star"
  "wave:1|c5def5|Wave 1: recon"
  "wave:2|c5def5|Wave 2: lock"
  "wave:3|c5def5|Wave 3: build"
  "wave:4|c5def5|Wave 4: soak"
  "wave:5|c5def5|Wave 5: critics"
  "wave:6|c5def5|Wave 6: launch"
  "type:recon|5319e7|Read-only research that returns a schema"
  "type:build|5319e7|A crew that changes code or content"
  "type:review|5319e7|A review or critic pass"
  "type:bug|5319e7|A defect, with evidence"
  "type:request|5319e7|A request to another crew or the orchestrator"
  "type:decision|5319e7|A decision to propose or lock in decisions.md"
  "status:ready|0e8a16|Ready to claim: every after-issue is done"
  "status:in-progress|fbca04|Claimed; see the latest checkpoint comment"
  "status:needs-review|1d76db|Gate passed; waiting for the gate agent and manager"
  "status:changes-requested|d93f0b|Review asked for changes"
  "status:blocked|b60205|Cannot continue; the latest comment says why"
  "status:done|cccccc|Merged or closed"
  "review:approved|0e8a16|Review verdict: approved"
  "review:changes-requested|d93f0b|Review verdict: changes requested"
  "needs:orchestrator|e99695|Needs a decision or action from the orchestrator"
  "placeholder-content|fef2c0|Touches placeholder content that the owner must confirm"
)

# title|description
MILESTONES=(
  "Wave 0 - setup|Tooling, both repos, the GitHub bootstrap and the Manor at /manor/ (gate G0)"
  "Wave 0.5 - north star|Owner voice, north star and fact packs; the owner signs the north star (G0.5)"
  "Wave 1 - recon|Direction tournament and specialist recon for W, M and G (G1a, G1)"
  "Wave 2 - lock|Decisions, deps, ownership, budgets and tokens locked; crew briefs filed (G2)"
  "Wave 3 - build|Foundations, vertical slices, then the crews (G3a, G3b)"
  "Wave 4 - soak|The composed site toured at every viewport; the biggest problems fixed (G4)"
  "Wave 5 - critics|Critics with screenshot-backed, adversarially verified findings (G5)"
  "Wave 6 - launch|Delete before adding, anti-slop and story gates, final pass, deploy (G6)"
)

writes=0

# Runs one GitHub write, or prints it under --dry-run.
write() {
  writes=$((writes + 1))
  if [ "$DRY_RUN" = 1 ]; then
    echo "    [dry-run] $*"
    return 0
  fi
  local attempt=1 delay=2 out wait
  while :; do
    if out=$("$@" 2>&1); then
      sleep 1
      return 0
    fi
    if [ "$attempt" -lt 5 ] && grep -qiE 'HTTP 403|HTTP 429|rate limit' <<<"$out"; then
      wait=$((delay + RANDOM % delay))
      echo "    rate limited; retry $attempt in ${wait}s" >&2
      sleep "$wait"
      attempt=$((attempt + 1))
      delay=$((delay * 2))
    else
      echo "$out" >&2
      return 1
    fi
  done
}

for repo in "${REPOS[@]}"; do
  echo "== $repo"
  before=$writes

  if [ "$repo" = "$FORK" ]; then
    issues=$(gh repo view "$repo" --json hasIssuesEnabled --jq .hasIssuesEnabled | tr -d '\r')
    if [ "$issues" = "true" ]; then
      echo "  issues: already enabled"
    else
      echo "  issues: enabling"
      write gh repo edit "$repo" --enable-issues
    fi
  fi

  existing=$(gh label list --repo "$repo" --limit 500 --json name,color,description \
    --jq '.[] | "\(.name)|\(.color | ascii_downcase)|\(.description)"' | tr -d '\r')
  for spec in "${LABELS[@]}"; do
    IFS='|' read -r name color desc <<<"$spec"
    if grep -Fxq -- "$spec" <<<"$existing"; then
      continue
    elif cut -d'|' -f1 <<<"$existing" | grep -Fxq -- "$name"; then
      echo "  label: update $name"
    else
      echo "  label: create $name"
    fi
    write gh label create "$name" --repo "$repo" --color "$color" --description "$desc" --force
  done

  titles=$(gh api "repos/$repo/milestones?state=all&per_page=100" --jq '.[].title' | tr -d '\r')
  for spec in "${MILESTONES[@]}"; do
    IFS='|' read -r title desc <<<"$spec"
    if grep -Fxq -- "$title" <<<"$titles"; then
      continue
    fi
    echo "  milestone: create $title"
    write gh api -X POST "repos/$repo/milestones" -f title="$title" -f description="$desc" --silent
  done

  echo "  $((writes - before)) write(s)"
done

if [ "$DRY_RUN" = 1 ]; then
  echo "dry run: $writes write(s) would be made"
else
  echo "done: $writes write(s)"
fi
