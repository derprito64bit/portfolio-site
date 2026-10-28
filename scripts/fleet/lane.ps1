<#
.SYNOPSIS
  Claims a shared single-instance tool lane (Blender MCP, Playwright MCP, Chrome DevTools MCP, Unity MCP) or the
  machine-wide perf lane for one agent at a time.

.DESCRIPTION
  These MCP servers each drive ONE application instance (one Blender, one browser, one Unity editor). All agents in a
  session share it, so two agents using it at once would drive each other's scenes and pages. Before using one, claim
  its lane. Release it when done. A claim is a folder %LOCALAPPDATA%\ion\lanes\<lane>.lock (created atomically) with
  an owner.txt. A claim older than -StaleMinutes (default 30) without a renew is considered abandoned and may be taken.

  perf is not a tool: it serializes timed measurement (Lighthouse, traces, frame counts) across the whole machine.
  While it is held, no Blender, Unity, npm ci/build or browser suite starts (docs/agents/PROTOCOL.md section 9;
  docs/agents/budgets.md "Measurement validity"). The fork's scripts/fork/lane.ps1 uses the same lane folder.

  acquire  waits (polling every 5 s, printing one line per minute) until the lane is free, then claims it. Exit 0 when
           claimed, 75 after -TimeoutMinutes (default 4). The wait rule (owner, 2026-10-27; PLAN.md "Waits and
           context"): no agent tool call blocks longer than 270 s, so -TimeoutMinutes is clamped to 4 unless
           -AllowLongWait is given (only for a detached process that no agent waits on); on exit 75 call it again.
           -ProcessId <pid> records the process that holds the claim (a detached perf queue passes its own pid). A claim
           whose recorded process has exited is abandoned at once, whatever its age.
  renew    refreshes your claim's timestamp (do it at least every 20 minutes during long work); keeps its pid.
  release  frees the lane if you hold it.
  status   lists every lane and its holder (with the holder's pid and whether it is alive, when one was recorded).

.EXAMPLE
  powershell -File scripts/fleet/lane.ps1 acquire blender -Agent m-c1-statues
  # ... use the Blender MCP tools ...
  powershell -File scripts/fleet/lane.ps1 release blender -Agent m-c1-statues
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)][ValidateSet('acquire', 'renew', 'release', 'status')][string]$Command,
    [Parameter(Position = 1)][ValidateSet('blender', 'playwright', 'devtools', 'unity-mcp', 'perf')][string]$Lane,
    [string]$Agent,
    [int]$StaleMinutes = 30,
    [int]$TimeoutMinutes = 4,
    [int]$ProcessId = 0,
    [switch]$AllowLongWait
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'ion\lanes'
New-Item -ItemType Directory -Force $root | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Get-Claim([string]$name) {
    $dir = Join-Path $root "$name.lock"
    if (-not (Test-Path $dir)) { return $null }
    $file = Join-Path $dir 'owner.txt'
    $owner = '(unknown)'
    $age = 0
    if (Test-Path $file) {
        try { $owner = ([IO.File]::ReadAllText($file)).Trim() } catch { }
        $age = ((Get-Date) - (Get-Item $file).LastWriteTime).TotalMinutes
    } else {
        $age = ((Get-Date) - (Get-Item $dir).LastWriteTime).TotalMinutes
    }
    return [pscustomobject]@{ Dir = $dir; File = $file; Owner = $owner; AgeMinutes = [math]::Round($age, 1) }
}

# owner.txt: '<agent> | <time>' or '<agent> | <time> | pid <n>'. A renew without -ProcessId keeps the recorded pid.
function Get-OwnerPid([string]$owner) { if ($owner -match '\| pid (\d+)$') { return [int]$matches[1] }; return 0 }
function Write-Owner([string]$file, [int]$keepPid = 0) {
    $p = if ($ProcessId -gt 0) { $ProcessId } else { $keepPid }
    $line = "$Agent | $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))"
    if ($p -gt 0) { $line += " | pid $p" }
    [IO.File]::WriteAllText($file, $line, $utf8)
}
function Test-PidAlive([int]$p) { return [bool]($p -gt 0 -and (Get-Process -Id $p -ErrorAction SilentlyContinue)) }

if ($Command -eq 'acquire' -and $TimeoutMinutes -gt 4 -and -not $AllowLongWait) {
    Write-Warning "lane: -TimeoutMinutes $TimeoutMinutes clamped to 4 (the 270 s wait rule); on exit 75 call acquire again"
    $TimeoutMinutes = 4
}

if ($Command -eq 'status') {
    foreach ($name in 'blender', 'playwright', 'devtools', 'unity-mcp', 'perf') {
        $c = Get-Claim $name
        if ($c) {
            $op = Get-OwnerPid $c.Owner
            $note = if ($op -gt 0) { if (Test-PidAlive $op) { ' [pid alive]' } else { ' [pid gone: abandoned]' } } else { '' }
            "{0,-10} held by {1} ({2} min ago){3}" -f $name, $c.Owner, $c.AgeMinutes, $note
        } else { "{0,-10} free" -f $name }
    }
    exit 0
}

if (-not $Lane) { throw 'Name a lane: blender, playwright, devtools, unity-mcp or perf.' }
if (-not $Agent) { throw 'Pass -Agent <your crew or role id>.' }

switch ($Command) {
    'acquire' {
        $start = Get-Date
        $lastNote = $start
        while ($true) {
            $dir = Join-Path $root "$Lane.lock"
            try {
                New-Item -ItemType Directory -Path $dir -ErrorAction Stop | Out-Null   # atomic: fails if it exists
                Write-Owner (Join-Path $dir 'owner.txt')
                "claimed lane '$Lane' for $Agent"
                exit 0
            } catch {
                $c = Get-Claim $Lane
                if ($c -and $c.Owner.StartsWith("$Agent |")) { Write-Owner $c.File (Get-OwnerPid $c.Owner); "already holding lane '$Lane' (renewed)"; exit 0 }
                $op = if ($c) { Get-OwnerPid $c.Owner } else { 0 }
                if ($c -and $op -gt 0 -and -not (Test-PidAlive $op)) {
                    Write-Warning "lane '$Lane' claim by $($c.Owner) names pid $op, which has exited; taking it over"
                    Remove-Item -Recurse -Force $c.Dir -ErrorAction SilentlyContinue
                    continue
                }
                if ($c -and $c.AgeMinutes -ge $StaleMinutes) {
                    Write-Warning "lane '$Lane' claim by $($c.Owner) is stale ($($c.AgeMinutes) min); taking it over"
                    Remove-Item -Recurse -Force $c.Dir -ErrorAction SilentlyContinue
                    continue
                }
                if (((Get-Date) - $start).TotalMinutes -ge $TimeoutMinutes) {
                    "gave up waiting for lane '$Lane' after $TimeoutMinutes min (held by $($c.Owner))"
                    exit 75
                }
                if (((Get-Date) - $lastNote).TotalMinutes -ge 1) {
                    "waiting for lane '{0}': {1} min, held by {2}" -f $Lane, [math]::Round(((Get-Date) - $start).TotalMinutes), $c.Owner
                    $lastNote = Get-Date
                }
                Start-Sleep -Seconds 5
            }
        }
    }
    'renew' {
        $c = Get-Claim $Lane
        if (-not $c -or -not $c.Owner.StartsWith("$Agent |")) { "you do not hold lane '$Lane'"; exit 1 }
        Write-Owner $c.File (Get-OwnerPid $c.Owner)
        "renewed lane '$Lane'"
    }
    'release' {
        $c = Get-Claim $Lane
        if (-not $c) { "lane '$Lane' is already free"; exit 0 }
        if (-not $c.Owner.StartsWith("$Agent |")) { "lane '$Lane' is held by $($c.Owner), not $Agent; not releasing"; exit 1 }
        Remove-Item -Recurse -Force $c.Dir
        "released lane '$Lane'"
    }
}
