<#
.SYNOPSIS
  Host-load precheck and watch for timed measurement (docs/agents/budgets.md "Measurement validity" R1-R5).

.DESCRIPTION
  Precheck (the default): takes the lane status (lane.ps1 status) and any leftover automation browsers or harness
  servers (the fork's scripts/fork/reap-browsers.ps1 -List) first, then -Samples one-second samples (default: the
  host key's precheck.samples, else 10) of \Processor(_Total)\% Processor Time and of GPU 3D utilization
  (\GPU Engine(*engtype_3D)\Utilization Percentage, summed per adapter; the busiest adapter counts). It records the
  top 5 processes by CPU time over the window and the top 3 GPU 3D users. Exit 0 only when every requested sample is
  valid and each metric's precheck statistic (the host key's precheck.stat: median, p95 or max) is at or under its
  *Max; 75 otherwise.

  -Watch <pid>: starts sampling at once (the lanes and leftovers are taken after the run) and samples in 5-second
  chunks until that process exits (at most -MaxMinutes). It flags each process whose CPU share in a chunk is above
  the host key's watch.foreignCpuPctMax, unless it is the watched process or one of its descendants, this script, or
  named in watch.allowlist (the processes seen during calibration). The JSON records the watched process's start, the
  first and last valid samples, its exit and the gaps between them. Exit 0 only when the whole run was watched and
  nothing was flagged: the process is in the samples, and the head gap (its start to the first valid sample), every
  gap between valid samples and the tail gap (the last valid sample to its exit) are each at most one 5-second chunk,
  and every sample is valid.
  Otherwise 75 (a gap over that bound gives 'incomplete', never 'clear').

  A sample is valid only when it has the CPU total, at least one engtype_3D instance (dwm always has one, so none
  means the counter is broken) and the per-process data. Missing data never reads as an idle host.

  Per-process CPU comes from the raw \Process(*) counters of the same samples (% Processor Time, ID Process, Creating
  Process ID, Elapsed Time), keyed by pid and creation time, so protected processes such as the antivirus are seen
  without elevation, and a reused pid or a shifted instance name is never mixed up. Get-Counter expands \Process(*)
  once per call, so a process born during a chunk is first seen in the next one, with all of its CPU time since its
  birth; a process born and gone within one chunk is not seen.

  The thresholds are READ from the json budgets block's "host" key in docs/agents/budgets.md. Until the orchestrator
  calibrates them they are null: the script still samples and writes its JSON, then exits 75 with the verdict
  'uncalibrated', which counts as blocked (host), never pass or fail.

  Verdicts, first match wins: no-data (no valid sample), uncalibrated, busy or flagged, incomplete, clear.
  Exit codes: 0 clear; 75 any other verdict (blocked: host); 2 usage or read error.
  The JSON goes to -Out (a one-line summary goes to stdout); without -Out the JSON goes to stdout.

  Leftover browsers come from reap-browsers.ps1 -List, found in this order: -ReapScript, %ION_REAP_BROWSERS%, then
  Documents\GitHub\project.ion\scripts\fork\ and its .claude\worktrees\overhaul\ copy. A copy without -List is skipped.

  -GpuPath is a test hook: a path with no engtype_3D instance must give no-data. A run with a non-default -GpuPath
  is never 'clear'.

.EXAMPLE
  powershell -File scripts/fleet/lane.ps1 acquire perf -Agent w-f-perf -TimeoutMinutes 45
  powershell -File scripts/fleet/lane.ps1 acquire blender -Agent w-f-perf -TimeoutMinutes 45
  powershell -File scripts/fleet/hostload.ps1 -Out <evidence>\hostload-lighthouse-pre.json   # exit 0 before the set
  $p = Start-Process node -ArgumentList 'scripts/crew.mjs', 'lighthouse' -PassThru -NoNewWindow
  powershell -File scripts/fleet/hostload.ps1 -Watch $p.Id -Out <evidence>\hostload-lighthouse-during.json
.EXAMPLE
  powershell -File scripts/fleet/hostload.ps1 -Samples 60 -Out <dir>\calibration-1.json   # calibration (exit 75)
#>
[CmdletBinding()]
param(
    [string]$Out,
    [int]$Watch = 0,
    [int]$Samples = 0,
    [int]$MaxMinutes = 60,
    [string]$Budgets,   # default: this repo's docs/agents/budgets.md
    [string]$ReapScript,
    [string]$GpuPath
)

$ErrorActionPreference = 'Stop'
$started = Get-Date
$GPU_DEFAULT = '\GPU Engine(*engtype_3D)\Utilization Percentage'
if (-not $GpuPath) { $GpuPath = $GPU_DEFAULT }
if (-not $Budgets) { $Budgets = Join-Path $PSScriptRoot '..\..\docs\agents\budgets.md' }   # $PSScriptRoot is empty in param defaults on PS 5.1
$cpus = [Environment]::ProcessorCount
$reasons = New-Object System.Collections.Generic.List[string]
$utf8 = New-Object System.Text.UTF8Encoding($false)
$CPU_PATH = '\Processor(_Total)\% Processor Time'
$PROC_PATHS = '\Process(*)\% Processor Time', '\Process(*)\ID Process', '\Process(*)\Creating Process ID', '\Process(*)\Elapsed Time'
$CHUNK = 5
$GAP_MAX = $CHUNK   # seconds: the most of a watched run that may go unsampled at its head, between samples or at its tail

function Fail-Usage([string]$msg) { [Console]::Error.WriteLine("hostload: $msg"); exit 2 }
function R1([object]$x) { if ($null -eq $x) { return $null }; return [math]::Round([double]$x, 1) }
function Iso([object]$d) { if ($null -eq $d) { return $null }; return ([datetime]$d).ToString('o') }

# ---- the watched process first (its handle keeps HasExited and ExitTime readable and its pid from being reused) -----
$wp = $null
$watchHeld = $false
$watchStart = $null
if ($Watch -gt 0) {
    $wp = Get-Process -Id $Watch -ErrorAction SilentlyContinue
    if (-not $wp) { Fail-Usage "no process with id $Watch" }
    try { [void]$wp.Handle; $watchHeld = $true } catch { }
    try { $watchStart = $wp.StartTime } catch { }
}

# ---- the host key -------------------------------------------------------------------------------------------------
if (-not (Test-Path $Budgets)) { Fail-Usage "budgets file not found: $Budgets" }
$md = [IO.File]::ReadAllText((Resolve-Path $Budgets).Path)
$m = [regex]::Match($md, '(?s)```json budgets\r?\n(.*?)\r?\n```')
if (-not $m.Success) { Fail-Usage "no json budgets block in $Budgets" }
try { $block = $m.Groups[1].Value | ConvertFrom-Json } catch { Fail-Usage "the json budgets block does not parse: $($_.Exception.Message)" }
$hk = $block.host
$pre = if ($hk) { $hk.precheck } else { $null }
$wat = if ($hk) { $hk.watch } else { $null }
$stat = if ($pre -and $pre.stat) { [string]$pre.stat } else { 'median' }
if ($stat -notin 'median', 'p95', 'max') { Fail-Usage "host.precheck.stat must be median, p95 or max (got '$stat')" }
if ($Samples -le 0) { $Samples = if ($pre -and $pre.samples) { [int]$pre.samples } else { 10 } }
if ($Watch -le 0 -and $Samples -lt 2) { Fail-Usage "-Samples must be at least 2 (got $Samples)" }
# An empty allowlist ([]) is calibrated; only null is not. Plain assignment keeps [] (an if-expression would unroll it).
$allowSet = [bool]($wat -and $null -ne $wat.allowlist)
$allowList = $null
if ($allowSet) { $allowList = [string[]]@($wat.allowlist) }
$thresholds = [ordered]@{
    stat             = $stat
    cpuBusyPctMax    = if ($pre) { $pre.cpuBusyPctMax } else { $null }
    gpu3dPctMax      = if ($pre) { $pre.gpu3dPctMax } else { $null }
    foreignCpuPctMax = if ($wat) { $wat.foreignCpuPctMax } else { $null }
    allowlist        = $allowList
    calibrated       = if ($hk) { $hk.calibrated } else { $null }
}

# ---- context: lanes and leftovers (child processes, so never inside a sampling window) ----------------------------
function Get-Lanes {
    $lanePs = Join-Path $PSScriptRoot 'lane.ps1'
    try {
        $lines = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $lanePs status
        return @($lines | ForEach-Object {
                $l = [string]$_
                if ($l -match '^(\S+)\s+held by (.+) \(([\d.]+) min ago\)$') {
                    [pscustomobject]@{ lane = $matches[1]; state = 'held'; holder = $matches[2]; ageMinutes = [double]$matches[3] }
                } elseif ($l -match '^(\S+)\s+free$') {
                    [pscustomobject]@{ lane = $matches[1]; state = 'free'; holder = $null; ageMinutes = $null }
                }
            })
    } catch { return @([pscustomobject]@{ lane = '?'; state = 'error'; holder = $_.Exception.Message; ageMinutes = $null }) }
}
function Get-Leftovers {
    $gh = Join-Path $env:USERPROFILE 'Documents\GitHub'
    $cands = @($ReapScript, $env:ION_REAP_BROWSERS,
        (Join-Path $gh 'project.ion\scripts\fork\reap-browsers.ps1'),
        (Join-Path $gh 'project.ion\.claude\worktrees\overhaul\scripts\fork\reap-browsers.ps1')) | Where-Object { $_ }
    $found = $null
    foreach ($c in $cands) {
        if (-not (Test-Path $c)) { continue }
        $full = (Resolve-Path $c).Path
        if ([IO.File]::ReadAllText($full) -match '\[switch\]\$List') { $found = $full; break }
    }
    if (-not $found) {
        return [pscustomobject]@{ source = $null; groups = $null; error = "no reap-browsers.ps1 with a -List mode among: $($cands -join '; ')" }
    }
    try {
        $json = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $found -List) -join "`n"
        $r = $json | ConvertFrom-Json
        return [pscustomobject]@{ source = $found; groups = @($r.groups); error = $null }
    } catch { return [pscustomobject]@{ source = $found; groups = $null; error = $_.Exception.Message } }
}

# ---- sampling ----------------------------------------------------------------------------------------------------
# One Get-Counter call of $n one-second samples. Each sample: cpu (total %), gpu (busiest adapter's 3D %, or $null
# when no engtype_3D instance came back), perPid (3D % per pid), procs (pid@created -> pid, ppid, created, name, t =
# raw CPU time in 100 ns) and tb (the raw time base, 100 ns UTC, the same clock as created).
function Get-Sets([int]$n) {
    try { $raw = @(Get-Counter -Counter (@($CPU_PATH, $GpuPath) + $PROC_PATHS) -SampleInterval 1 -MaxSamples $n -ErrorAction SilentlyContinue) }
    catch { $raw = @() }
    foreach ($set in $raw) {
        $cpu = $null
        $tb = $null
        $adapters = @{}
        $perPid = @{}
        $inst = @{}
        foreach ($cs in $set.CounterSamples) {
            if ($cs.Status -ne 0) { continue }   # e.g. an instance whose process exited after the call expanded '*'
            $path = $cs.Path
            if ($path -like '*\processor(_total)\*') { $cpu = [double]$cs.CookedValue; continue }
            $cut = $path.LastIndexOf('\')
            $at = $path.IndexOf('\process(')
            if ($at -ge 0 -and $at -lt $cut) {
                # The instance from the path, e.g. chrome#3 (InstanceName drops the #n, so it would merge same-name processes).
                $nm = $path.Substring($at + 9, $cut - $at - 10)
                if ($nm -eq '_total' -or $nm -eq 'idle') { continue }
                $i = $inst[$nm]
                if ($null -eq $i) { $i = @{}; $inst[$nm] = $i }
                switch ($path.Substring($cut + 1)) {
                    '% processor time' { $i.t = [double]$cs.RawValue; $tb = [long]$cs.SecondValue }
                    'id process' { $i.id = [int]$cs.RawValue }
                    'creating process id' { $i.ppid = [int]$cs.RawValue }
                    'elapsed time' { $i.created = [long]$cs.RawValue }
                }
                continue
            }
            if ($cs.InstanceName -match '^pid_(\d+)_luid_(0x[0-9a-f]+_0x[0-9a-f]+)_phys_\d+_eng_\d+_engtype_3d$') {
                $adapters[$matches[2]] = [double]$adapters[$matches[2]] + $cs.CookedValue
                $perPid[[int]$matches[1]] = [double]$perPid[[int]$matches[1]] + $cs.CookedValue
            }
        }
        $procs = @{}
        foreach ($nm in $inst.Keys) {
            $i = $inst[$nm]
            if ($null -eq $i.t -or $null -eq $i.id -or $null -eq $i.ppid -or $null -eq $i.created) { continue }
            $procs["$($i.id)@$($i.created)"] = @{ id = $i.id; ppid = $i.ppid; created = $i.created; name = ($nm -replace '#\d+$', ''); t = $i.t }
        }
        $gpu = $null
        foreach ($v in $adapters.Values) { if ($null -eq $gpu -or $v -gt $gpu) { $gpu = $v } }
        if ($null -ne $gpu) { $gpu = [math]::Min(100.0, $gpu) }
        [pscustomobject]@{
            at     = $set.Timestamp
            tb     = $tb
            cpu    = $cpu
            gpu    = $gpu
            perPid = $perPid
            procs  = $procs
            valid  = ($null -ne $cpu -and $null -ne $gpu -and $null -ne $tb -and $procs.Count -gt 0)
        }
    }
}
function Get-Stats($values) {
    $s = @($values | Where-Object { $null -ne $_ } | ForEach-Object { [double]$_ } | Sort-Object)
    $n = $s.Count
    if (-not $n) { return [pscustomobject]@{ samples = @(); median = $null; p95 = $null; max = $null; mean = $null } }
    $med = if ($n % 2) { $s[($n - 1) / 2] } else { ($s[$n / 2 - 1] + $s[$n / 2]) / 2 }
    return [pscustomobject]@{
        samples = @($values | ForEach-Object { R1 $_ })
        median  = R1 $med
        p95     = R1 $s[[int][math]::Ceiling(0.95 * $n) - 1]   # nearest rank: the maximum when n <= 20
        max     = R1 $s[$n - 1]
        mean    = R1 (($s | Measure-Object -Sum).Sum / $n)
    }
}

# Every process seen (pid@created -> its record) and, per pid, its records (a pid can be reused).
$known = @{}
$byId = @{}
$parentOf = @{}
function Add-Known($sets) {
    foreach ($s in $sets) {
        foreach ($k in $s.procs.Keys) {
            if ($known.ContainsKey($k)) { continue }
            $p = $s.procs[$k]
            $known[$k] = $p
            if (-not $byId.ContainsKey($p.id)) { $byId[$p.id] = New-Object System.Collections.Generic.List[string] }
            $byId[$p.id].Add($k)
        }
    }
}
# A process's parent is the newest seen process with its parent pid created no later than it, so a reused parent
# pid never adopts an older process. A parent never seen (it exited before any sample) leaves the child outside.
function Get-ParentKey([string]$k) {
    $p = $known[$k]
    $best = $null
    $bestAt = $null
    if ($p.ppid -ne $p.id -and $byId.ContainsKey($p.ppid)) {
        foreach ($c in $byId[$p.ppid]) {
            $cr = $known[$c].created
            if ($cr -le $p.created -and ($null -eq $bestAt -or $cr -gt $bestAt)) { $best = $c; $bestAt = $cr }
        }
    }
    return $best
}
function Get-RootKey([int]$id, [object]$start) {
    if (-not $byId.ContainsKey($id)) { return $null }
    $best = $null
    foreach ($k in $byId[$id]) {
        if ($null -ne $start -and [math]::Abs($known[$k].created - ([datetime]$start).ToFileTimeUtc()) -gt 10000000) { continue }
        if ($null -eq $best -or $known[$k].created -gt $known[$best].created) { $best = $k }
    }
    return $best
}
# Grows a tree (a hashtable of keys) to every seen descendant of its members.
function Grow-Tree($tree) {
    if (-not $tree.Count) { return }
    do {
        $grew = $false
        foreach ($k in @($known.Keys)) {
            if ($tree.ContainsKey($k)) { continue }
            if (-not $parentOf.ContainsKey($k) -or $null -eq $parentOf[$k]) { $parentOf[$k] = Get-ParentKey $k }
            if ($null -ne $parentOf[$k] -and $tree.ContainsKey($parentOf[$k])) { $tree[$k] = $true; $grew = $true }
        }
    } while ($grew)
}

# CPU time each process used between $from (a time base; $null = the first usable sample) and the last usable sample
# of $sets, as a share of the whole machine (all logical CPUs) in %. $seen carries each process's last raw CPU time
# across calls, so the gap between two Get-Counter calls is counted too. A process first seen here counts all of its
# CPU time when it was born after $t0 (the start of sampling); one already running then is only a baseline.
$seen = @{}
function Measure-Span($sets, [object]$from, [long]$t0) {
    $use = @{}
    $to = $from
    foreach ($s in $sets) {
        if ($null -eq $s.tb -or -not $s.procs.Count) { continue }
        foreach ($k in $s.procs.Keys) {
            $p = $s.procs[$k]
            $d = if ($seen.ContainsKey($k)) { $p.t - $seen[$k] } elseif ($p.created -ge $t0) { $p.t } else { 0 }
            $seen[$k] = $p.t
            if ($d -gt 0) { $use[$k] = [double]$use[$k] + $d }
        }
        if ($null -eq $from) { $from = $s.tb }
        $to = $s.tb
    }
    $shares = @()
    if ($null -ne $from -and $to -gt $from) {
        $dt = [double]($to - $from)
        $shares = @($use.Keys | ForEach-Object {
                [pscustomobject]@{ key = $_; pid = $known[$_].id; name = $known[$_].name; pct = (R1 ($use[$_] / $dt / $cpus * 100)) }
            } | Where-Object { $_.pct -gt 0 } | Sort-Object pct -Descending)
    }
    return [pscustomobject]@{ from = $from; to = $to; seconds = $(if ($null -ne $from) { R1 (($to - $from) / 1e7) } else { $null }); shares = $shares }
}
function Get-GpuTop($sets) {
    $sum = @{}
    $n = 0
    foreach ($s in $sets) {
        if ($null -eq $s.gpu) { continue }
        $n++
        foreach ($k in $s.perPid.Keys) { $sum[$k] = [double]$sum[$k] + $s.perPid[$k] }
    }
    $n = [math]::Max(1, $n)
    return @($sum.Keys | ForEach-Object {
            $nm = if ($byId.ContainsKey($_)) { $known[$byId[$_][$byId[$_].Count - 1]].name } else { $null }
            [pscustomobject]@{ pid = $_; name = $nm; meanPct = (R1 ($sum[$_] / $n)) }
        } | Where-Object { $_.meanPct -gt 0 } | Sort-Object meanPct -Descending | Select-Object -First 3)
}
function Test-Exited {
    if ($watchHeld) { try { return [bool]$wp.HasExited } catch { } }
    return -not (Get-Process -Id $Watch -ErrorAction SilentlyContinue)
}
function Get-Scope($share, $tree, $self) {
    if ($tree.ContainsKey($share.key)) { return 'watched' }
    if ($self.ContainsKey($share.key)) { return 'self' }
    return 'other'
}
function Out-Share($share, [string]$scope) {
    return [pscustomobject]@{ pid = $share.pid; name = $share.name; pct = $share.pct; scope = $scope }
}

$result = [ordered]@{
    tool        = 'hostload.ps1'
    schema      = 1
    mode        = if ($Watch -gt 0) { 'watch' } else { 'precheck' }
    verdict     = $null
    exitCode    = $null
    reasons     = $null
    startedAt   = $started.ToString('o')
    endedAt     = $null
    computer    = $env:COMPUTERNAME
    logicalCpus = $cpus
    budgets     = (Resolve-Path $Budgets).Path
    gpuPath     = $GpuPath
    thresholds  = $thresholds
}
$uncal = $false
$verdict = $null
$selfTree = @{}

if ($Watch -le 0) {
    # ---- precheck: context first, then the window ----
    $lanes = Get-Lanes
    $leftovers = Get-Leftovers
    $contextTaken = 'before-sampling'
    Start-Sleep -Seconds 1   # let the two child PowerShells and their WMI queries settle before the window opens
    $t0 = (Get-Date).ToFileTimeUtc()
    $sets = @(Get-Sets $Samples)
    Add-Known $sets
    $sk = Get-RootKey $PID $null
    if ($sk) { $selfTree[$sk] = $true; Grow-Tree $selfTree }
    $span = Measure-Span $sets $null $t0
    $valid = @($sets | Where-Object { $_.valid })
    $cpuStats = Get-Stats @($sets | ForEach-Object { $_.cpu })
    $gpuStats = Get-Stats @($sets | ForEach-Object { $_.gpu })
    $result.requestedSamples = $Samples
    $result.validSamples = $valid.Count
    $result.cpuBusyPct = $cpuStats
    $result.gpu3dPct = $gpuStats
    $result.topCpu = @($span.shares | Select-Object -First 5 | ForEach-Object { Out-Share $_ (Get-Scope $_ @{} $selfTree) })
    $result.topCpuSeconds = $span.seconds
    $result.gpu3dTop = Get-GpuTop $sets
    if (@($sets).Count -and -not @($sets | Where-Object { $null -ne $_.gpu }).Count) {
        $reasons.Add("no GPU 3D data: '$GpuPath' returned no engtype_3D instance (dwm always has one, so the counter is broken)")
    }
    if ($valid.Count -lt $Samples) {
        $reasons.Add("only $($valid.Count) of $Samples samples were valid (each needs the CPU total, a GPU 3D instance and the per-process data)")
    }
    if (-not $valid.Count) {
        $verdict = 'no-data'
    } elseif ($null -eq $thresholds.cpuBusyPctMax -or $null -eq $thresholds.gpu3dPctMax) {
        $uncal = $true
    } else {
        $busy = $false
        if ($null -ne $cpuStats.$stat -and $cpuStats.$stat -gt [double]$thresholds.cpuBusyPctMax) { $busy = $true; $reasons.Add("cpu $stat $($cpuStats.$stat)% > cpuBusyPctMax $($thresholds.cpuBusyPctMax)%") }
        if ($null -ne $gpuStats.$stat -and $gpuStats.$stat -gt [double]$thresholds.gpu3dPctMax) { $busy = $true; $reasons.Add("gpu3d $stat $($gpuStats.$stat)% > gpu3dPctMax $($thresholds.gpu3dPctMax)%") }
        $verdict = if ($busy) { 'busy' } elseif ($valid.Count -lt $Samples) { 'incomplete' } else { 'clear' }
    }
} else {
    # ---- watch: sampling starts at once; the context is taken after the run ----
    $allow = @($allowList)
    $foreignMax = $thresholds.foreignCpuPctMax
    $uncal = ($null -eq $foreignMax -or -not $allowSet)
    $tree = @{}
    $rootKey = $null
    $chunks = New-Object System.Collections.Generic.List[object]
    $flagged = @{}
    $allSets = New-Object System.Collections.Generic.List[object]
    $deadline = $started.AddMinutes($MaxMinutes)
    $exited = $false
    $exitSeenAt = $null
    $from = $null
    $t0 = (Get-Date).ToFileTimeUtc()
    while ($true) {
        $s = @(Get-Sets $CHUNK)
        if (-not $s.Count) { Start-Sleep -Seconds 1 }   # a broken counter returns at once: no hot loop
        $exited = Test-Exited
        if ($exited) { $exitSeenAt = Get-Date }
        foreach ($x in $s) { $allSets.Add($x) }
        Add-Known $s
        if (-not $rootKey) { $rootKey = Get-RootKey $Watch $watchStart; if ($rootKey) { $tree[$rootKey] = $true } }
        if (-not $selfTree.Count) { $sk = Get-RootKey $PID $null; if ($sk) { $selfTree[$sk] = $true } }
        Grow-Tree $tree
        Grow-Tree $selfTree
        $span = Measure-Span $s $from $t0
        if ($null -ne $span.to) { $from = $span.to }
        $foreign = @($span.shares | Where-Object { -not $tree.ContainsKey($_.key) -and -not $selfTree.ContainsKey($_.key) })
        $over = @()
        if (-not $uncal) {
            $over = @($foreign | Where-Object { $_.pct -gt [double]$foreignMax -and -not ($allow -contains $_.name) })
            foreach ($f in $over) {
                if (-not $flagged.ContainsKey($f.name) -or $flagged[$f.name].maxPct -lt $f.pct) {
                    $flagged[$f.name] = [pscustomobject]@{ name = $f.name; pid = $f.pid; maxPct = $f.pct }
                }
            }
        }
        $sv = @($s | Where-Object { $_.valid })
        $chunks.Add([pscustomobject]@{
                at           = if ($sv.Count) { Iso ($sv[$sv.Count - 1].at) } else { (Get-Date).ToString('o') }
                validSamples = $sv.Count
                seconds      = $span.seconds
                cpuMedian    = (Get-Stats @($s | ForEach-Object { $_.cpu })).median
                gpu3dMedian  = (Get-Stats @($s | ForEach-Object { $_.gpu })).median
                top          = @($span.shares | Select-Object -First 5 | ForEach-Object { Out-Share $_ (Get-Scope $_ $tree $selfTree) })
                foreignTop   = @($foreign | Select-Object -First 5 | ForEach-Object { Out-Share $_ 'other' })
                flagged      = @($over | ForEach-Object { Out-Share $_ 'other' })
            })
        if ($exited) { break }
        if ((Get-Date) -ge $deadline) { break }
    }
    $exitedAt = $null
    if ($exited -and $watchHeld) { try { $exitedAt = $wp.ExitTime } catch { } }
    $startSource = 'Get-Process'
    if ($null -eq $watchStart -and $rootKey) { $watchStart = [datetime]::FromFileTime($known[$rootKey].created); $startSource = 'counter' }
    if ($null -eq $watchStart) { $startSource = $null }
    $lanes = Get-Lanes
    $leftovers = Get-Leftovers
    $contextTaken = 'after-watch'

    # ---- coverage: was the whole run watched? ----
    $valid = @($allSets | Where-Object { $_.valid })
    $firstAt = if ($valid.Count) { $valid[0].at } else { $null }
    $lastAt = if ($valid.Count) { $valid[$valid.Count - 1].at } else { $null }
    $headGap = if ($null -ne $watchStart -and $null -ne $firstAt) { R1 ($firstAt - $watchStart).TotalSeconds } else { $null }
    $maxGap = 0.0
    for ($i = 1; $i -lt $valid.Count; $i++) { $g = ($valid[$i].at - $valid[$i - 1].at).TotalSeconds; if ($g -gt $maxGap) { $maxGap = $g } }
    $exitRef = if ($null -ne $exitedAt) { $exitedAt } else { $exitSeenAt }   # exitSeenAt is later than the exit: an upper bound
    $tailGap = if ($exited -and $null -ne $lastAt) { R1 ([math]::Max(0.0, ($exitRef - $lastAt).TotalSeconds)) } else { $null }
    $seenInSamples = [bool]($rootKey -and @($allSets | Where-Object { $_.procs.ContainsKey($rootKey) }).Count)

    $result.cpuBusyPct = Get-Stats @($allSets | ForEach-Object { $_.cpu })
    $result.gpu3dPct = Get-Stats @($allSets | ForEach-Object { $_.gpu })
    $result.watch = [ordered]@{
        pid              = $Watch
        exited           = $exited
        processStartedAt = Iso $watchStart
        startSource      = $startSource
        firstSampleAt    = Iso $firstAt
        lastSampleAt     = Iso $lastAt
        exitedAt         = Iso $exitedAt
        exitSeenAt       = Iso $exitSeenAt
        gapMaxSec        = $GAP_MAX
        headGapSec       = $headGap
        maxGapSec        = R1 $maxGap
        tailGapSec       = $tailGap
        samples          = $allSets.Count
        validSamples     = $valid.Count
        processSampled   = $seenInSamples
        tree             = @($tree.Keys | ForEach-Object { $known[$_].id } | Sort-Object -Unique)
        chunks           = $chunks.ToArray()
        flagged          = @($flagged.Values | Sort-Object maxPct -Descending)
    }

    $gaps = $false
    if ($allSets.Count -and -not @($allSets | Where-Object { $null -ne $_.gpu }).Count) {
        $reasons.Add("no GPU 3D data: '$GpuPath' returned no engtype_3D instance (dwm always has one, so the counter is broken)")
    }
    if ($valid.Count -lt $allSets.Count) { $reasons.Add("only $($valid.Count) of $($allSets.Count) samples were valid (each needs the CPU total, a GPU 3D instance and the per-process data)") }
    if ($null -eq $watchStart) { $gaps = $true; $reasons.Add("the start time of process $Watch could not be read, so the head of its run cannot be shown to be watched") }
    elseif ($null -ne $headGap -and $headGap -gt $GAP_MAX) { $gaps = $true; $reasons.Add("head gap $headGap s from the start of process $Watch to the first valid sample > $GAP_MAX s: the start of the run was not watched") }
    if ($valid.Count -and -not $seenInSamples) { $gaps = $true; $reasons.Add("process $Watch is in no sample: it exited before the first sample, so none of its run was watched") }
    if ($maxGap -gt $GAP_MAX) { $gaps = $true; $reasons.Add("a gap of $(R1 $maxGap) s between valid samples > $GAP_MAX s: part of the run was not watched") }
    if ($null -ne $tailGap -and $tailGap -gt $GAP_MAX) { $gaps = $true; $reasons.Add("tail gap $tailGap s from the last valid sample to the exit of process $Watch > $GAP_MAX s") }
    if (-not $exited) { $gaps = $true; $reasons.Add("stopped after -MaxMinutes $MaxMinutes with process $Watch still running: the run was not watched to its end") }
    if ($valid.Count -lt $allSets.Count) { $gaps = $true }
    if (-not $valid.Count) {
        $verdict = 'no-data'
    } elseif (-not $uncal) {
        foreach ($f in $result.watch.flagged) { $reasons.Add("foreign process $($f.name) (pid $($f.pid)) at $($f.maxPct)% > foreignCpuPctMax $foreignMax%") }
        $verdict = if ($flagged.Count) { 'flagged' } elseif ($gaps) { 'incomplete' } else { 'clear' }
    }
}
if ($uncal -and $verdict -ne 'no-data') {
    $verdict = 'uncalibrated'
    $reasons.Insert(0, 'the budgets.md host key has null thresholds (not calibrated yet): blocked (host), never pass or fail')
}
if ($verdict -eq 'no-data') { $reasons.Add('no valid counter samples') }
if ($verdict -eq 'clear' -and $GpuPath -ne $GPU_DEFAULT) {
    $verdict = 'incomplete'
    $reasons.Add("test hook: -GpuPath '$GpuPath' is not the default GPU 3D path, so this run is never clear")
}
$code = if ($verdict -eq 'clear') { 0 } else { 75 }

$result.verdict = $verdict
$result.exitCode = $code
$result.reasons = $reasons.ToArray()
$result.endedAt = (Get-Date).ToString('o')
$result.contextTaken = $contextTaken
$result.lanes = $lanes
$result.leftovers = $leftovers
$json = [pscustomobject]$result | ConvertTo-Json -Depth 8

function Fmt-Pct([object]$x) { if ($null -eq $x) { 'n/a' } else { "$x%" } }
$summary = 'hostload {0}: {1} (exit {2}); cpu {3} {4} (max {5}), gpu3d {3} {6} (max {7}); held lanes: {8}; leftover groups: {9}' -f
$result.mode, $verdict, $code, $stat, (Fmt-Pct $result.cpuBusyPct.$stat), (Fmt-Pct $result.cpuBusyPct.max), (Fmt-Pct $result.gpu3dPct.$stat),
(Fmt-Pct $result.gpu3dPct.max), ((@($lanes | Where-Object state -eq 'held' | ForEach-Object { "$($_.lane) ($($_.holder))" }) -join ', ') -replace '^$', 'none'),
$(if ($null -ne $leftovers.groups) { @($leftovers.groups).Count } else { 'unknown' })
if ($Out) {
    $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out)   # relative to $PWD, not .NET's
    $dir = Split-Path -Parent $full
    if ($dir) { New-Item -ItemType Directory -Force $dir | Out-Null }
    [IO.File]::WriteAllText($full, $json, $utf8)
    $summary
    foreach ($r in $reasons) { "  $r" }
    "  json: $full"
} else {
    $json
}
exit $code
