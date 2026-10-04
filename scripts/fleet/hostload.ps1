<#
.SYNOPSIS
  Host-load precheck and watch for timed measurement (docs/agents/budgets.md "Measurement validity" R1-R5).

.DESCRIPTION
  Precheck (the default): takes -Samples one-second samples (default: the host key's precheck.samples, else 10) of
  \Processor(_Total)\% Processor Time and of GPU 3D utilization (\GPU Engine(*engtype_3D)\Utilization Percentage,
  summed per adapter; the busiest adapter counts). It also records the top 5 processes by CPU-time delta over the
  window, the top 3 GPU 3D users, the lane status (lane.ps1 status) and any leftover automation browsers or harness
  servers (the fork's scripts/fork/reap-browsers.ps1 -List). Exit 0 when each metric's precheck statistic (the host
  key's precheck.stat: median, p95 or max) is at or under its *Max; 75 otherwise.

  -Watch <pid>: samples in 5-second chunks until that process exits (at most -MaxMinutes), and flags each process
  whose CPU share in a chunk is above the host key's watch.foreignCpuPctMax, unless it is the watched process or one
  of its descendants, this script, or named in watch.allowlist (the processes seen during calibration). Exit 0 when
  the whole run was watched and nothing was flagged; 75 otherwise.

  The thresholds are READ from the json budgets block's "host" key in docs/agents/budgets.md. Until the orchestrator
  calibrates them they are null: the script still samples and writes its JSON, then exits 75 with the verdict
  'uncalibrated', which counts as blocked (host), never pass or fail.

  Exit codes: 0 clear; 75 busy, flagged, incomplete, no-data or uncalibrated (blocked: host); 2 usage or read error.
  The JSON goes to -Out (a one-line summary goes to stdout); without -Out the JSON goes to stdout.

  Leftover browsers come from reap-browsers.ps1 -List, found in this order: -ReapScript, %ION_REAP_BROWSERS%, then
  Documents\GitHub\project.ion\scripts\fork\ and its .claude\worktrees\overhaul\ copy. A copy without -List is skipped.

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
    [string]$ReapScript
)

$ErrorActionPreference = 'Stop'
if (-not $Budgets) { $Budgets = Join-Path $PSScriptRoot '..\..\docs\agents\budgets.md' }   # $PSScriptRoot is empty in param defaults on PS 5.1
$started = Get-Date
$cpus = [Environment]::ProcessorCount
$reasons = New-Object System.Collections.Generic.List[string]
$utf8 = New-Object System.Text.UTF8Encoding($false)
$CPU_PATH = '\Processor(_Total)\% Processor Time'
$GPU_PATH = '\GPU Engine(*engtype_3D)\Utilization Percentage'
$CHUNK = 5

function Fail-Usage([string]$msg) { [Console]::Error.WriteLine("hostload: $msg"); exit 2 }
function R1([object]$x) { if ($null -eq $x) { return $null }; return [math]::Round([double]$x, 1) }

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
if ($Watch -gt 0 -and -not (Get-Process -Id $Watch -ErrorAction SilentlyContinue)) { Fail-Usage "no process with id $Watch" }

# ---- context: lanes and leftovers (taken before sampling so these child processes are not in the window) ---------
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
# CPU time per process from the raw counters (PercentProcessorTime is cumulative 100 ns ticks), which also covers
# protected processes such as the antivirus that Get-Process cannot read without elevation.
function Get-CpuSnapshot {
    $rows = Get-CimInstance Win32_PerfRawData_PerfProc_Process -Property Name, IDProcess, PercentProcessorTime, Timestamp_Sys100NS
    $snap = @{ at = 0; procs = @{} }
    foreach ($r in $rows) {
        if ($r.Name -eq '_Total') { $snap.at = [double]$r.Timestamp_Sys100NS; continue }
        if ($r.Name -eq 'Idle') { continue }
        $snap.procs[[int]$r.IDProcess] = @{ name = ($r.Name -replace '#\d+$', ''); t = [double]$r.PercentProcessorTime }
    }
    return $snap
}
# Each process's share of the whole machine (all logical CPUs) between two snapshots, in %.
function Get-Shares($a, $b) {
    $dt = $b.at - $a.at
    if ($dt -le 0) { return @() }
    $list = foreach ($id in $b.procs.Keys) {
        $pb = $b.procs[$id]
        $pa = $a.procs[$id]
        $delta = if ($pa -and $pa.name -eq $pb.name) { $pb.t - $pa.t } else { $pb.t }   # born during the window
        if ($delta -gt 0) { [pscustomobject]@{ pid = $id; name = $pb.name; pct = (R1 ($delta / $dt / $cpus * 100)) } }
    }
    return @($list | Sort-Object pct -Descending)
}
function Get-Samples([int]$n) {
    try { $sets = @(Get-Counter -Counter $CPU_PATH, $GPU_PATH -SampleInterval 1 -MaxSamples $n -ErrorAction SilentlyContinue) }
    catch { $sets = @() }
    return @($sets | ForEach-Object {
            $cpu = $null
            $adapters = @{}
            $perPid = @{}
            foreach ($cs in $_.CounterSamples) {
                if ($cs.Path -like '*\processor(_total)\*') { $cpu = [double]$cs.CookedValue; continue }
                if ($cs.InstanceName -match '^pid_(\d+)_luid_(0x[0-9a-f]+_0x[0-9a-f]+)_phys_\d+_eng_\d+_engtype_3d$') {
                    $adapters[$matches[2]] = [double]$adapters[$matches[2]] + $cs.CookedValue
                    $perPid[[int]$matches[1]] = [double]$perPid[[int]$matches[1]] + $cs.CookedValue
                }
            }
            $gpu = 0.0
            foreach ($v in $adapters.Values) { if ($v -gt $gpu) { $gpu = $v } }
            [pscustomobject]@{ cpu = $cpu; gpu = [math]::Min(100.0, $gpu); perPid = $perPid }
        } | Where-Object { $null -ne $_.cpu })
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
function Get-GpuTop($samples, $names) {
    $sum = @{}
    foreach ($s in $samples) { foreach ($k in $s.perPid.Keys) { $sum[$k] = [double]$sum[$k] + $s.perPid[$k] } }
    $n = [math]::Max(1, @($samples).Count)
    return @($sum.Keys | ForEach-Object {
            $nm = if ($names.ContainsKey($_)) { $names[$_].name } else { $null }
            [pscustomobject]@{ pid = $_; name = $nm; meanPct = (R1 ($sum[$_] / $n)) }
        } | Where-Object { $_.meanPct -gt 0 } | Sort-Object meanPct -Descending | Select-Object -First 3)
}
# The watched process and every descendant (creation order guards against reused parent ids).
function Get-Tree([int]$rootPid) {
    $procs = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId, CreationDate)
    $born = @{}
    $kids = @{}
    foreach ($p in $procs) {
        $born[[int]$p.ProcessId] = $p.CreationDate
        $pp = [int]$p.ParentProcessId
        if (-not $kids.ContainsKey($pp)) { $kids[$pp] = New-Object System.Collections.Generic.List[int] }
        $kids[$pp].Add([int]$p.ProcessId)
    }
    $set = New-Object 'System.Collections.Generic.HashSet[int]'
    [void]$set.Add($rootPid)
    $q = New-Object 'System.Collections.Generic.Queue[int]'
    $q.Enqueue($rootPid)
    while ($q.Count) {
        $x = $q.Dequeue()
        if (-not $kids.ContainsKey($x)) { continue }
        foreach ($c in $kids[$x]) {
            if ($born[$c] -and $born[$x] -and $born[$c] -lt $born[$x]) { continue }
            if ($set.Add($c)) { $q.Enqueue($c) }
        }
    }
    return , $set   # the comma keeps the set whole (the pipeline would unroll it)
}

$lanes = Get-Lanes
$leftovers = Get-Leftovers
[void](Get-CpuSnapshot)   # warm the WMI performance provider (its first query is slow) before the window opens
Start-Sleep -Seconds 1

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
    thresholds  = $thresholds
}
$uncal = $false

if ($Watch -le 0) {
    # ---- precheck ----
    $a = Get-CpuSnapshot
    $sets = Get-Samples $Samples   # (not $samples: PowerShell names are case-insensitive and $Samples is the [int] count)
    $b = Get-CpuSnapshot
    $cpuStats = Get-Stats @($sets | ForEach-Object { $_.cpu })
    $gpuStats = Get-Stats @($sets | ForEach-Object { $_.gpu })
    $result.cpuBusyPct = $cpuStats
    $result.gpu3dPct = $gpuStats
    $result.topCpu = @(Get-Shares $a $b | Select-Object -First 5 |
            ForEach-Object { if ($_.pid -eq $PID) { $_ | Add-Member -NotePropertyName self -NotePropertyValue $true }; $_ })
    $result.gpu3dTop = Get-GpuTop $sets $b.procs
    if (@($sets).Count -lt $Samples) { $reasons.Add("only $(@($sets).Count) of $Samples samples were valid") }
    if (-not @($sets).Count) {
        $verdict = 'no-data'
    } elseif ($null -eq $thresholds.cpuBusyPctMax -or $null -eq $thresholds.gpu3dPctMax) {
        $uncal = $true
    } else {
        if ($cpuStats.$stat -gt [double]$thresholds.cpuBusyPctMax) { $reasons.Add("cpu $stat $($cpuStats.$stat)% > cpuBusyPctMax $($thresholds.cpuBusyPctMax)%") }
        if ($gpuStats.$stat -gt [double]$thresholds.gpu3dPctMax) { $reasons.Add("gpu3d $stat $($gpuStats.$stat)% > gpu3dPctMax $($thresholds.gpu3dPctMax)%") }
        $verdict = if ($reasons | Where-Object { $_ -like 'cpu *' -or $_ -like 'gpu3d *' }) { 'busy' } else { 'clear' }
    }
} else {
    # ---- watch ----
    $allow = @($allowList)
    $foreignMax = $thresholds.foreignCpuPctMax
    $uncal = ($null -eq $foreignMax -or -not $allowSet)
    $self = Get-Tree $PID
    $tree = New-Object 'System.Collections.Generic.HashSet[int]'
    $chunks = New-Object System.Collections.Generic.List[object]
    $flagged = @{}
    $allSamples = New-Object System.Collections.Generic.List[object]
    $deadline = $started.AddMinutes($MaxMinutes)
    $exited = $false
    while ($true) {
        if (-not (Get-Process -Id $Watch -ErrorAction SilentlyContinue)) { $exited = $true; break }
        if ((Get-Date) -ge $deadline) { break }
        $a = Get-CpuSnapshot
        $s = Get-Samples $CHUNK
        $b = Get-CpuSnapshot
        foreach ($x in (Get-Tree $Watch)) { [void]$tree.Add($x) }
        foreach ($x in $s) { $allSamples.Add($x) }
        $shares = Get-Shares $a $b
        $foreign = @()
        if (-not $uncal) {
            $foreign = @($shares | Where-Object {
                    $_.pct -gt [double]$foreignMax -and -not $tree.Contains($_.pid) -and -not $self.Contains($_.pid) -and
                    -not ($allow -contains $_.name)
                })
            foreach ($f in $foreign) {
                if (-not $flagged.ContainsKey($f.name) -or $flagged[$f.name].maxPct -lt $f.pct) {
                    $flagged[$f.name] = [pscustomobject]@{ name = $f.name; pid = $f.pid; maxPct = $f.pct }
                }
            }
        }
        $chunks.Add([pscustomobject]@{
                at          = (Get-Date).ToString('o')
                cpuMedian   = (Get-Stats @($s | ForEach-Object { $_.cpu })).median
                gpu3dMedian = (Get-Stats @($s | ForEach-Object { $_.gpu })).median
                top         = @($shares | Select-Object -First 5)
                flagged     = $foreign
            })
    }
    $result.cpuBusyPct = Get-Stats @($allSamples | ForEach-Object { $_.cpu })
    $result.gpu3dPct = Get-Stats @($allSamples | ForEach-Object { $_.gpu })
    $result.watch = [ordered]@{
        pid     = $Watch
        exited  = $exited
        tree    = @($tree | Sort-Object)
        chunks  = $chunks.ToArray()
        flagged = @($flagged.Values | Sort-Object maxPct -Descending)
    }
    if (-not $exited) { $reasons.Add("stopped after -MaxMinutes $MaxMinutes with process $Watch still running: the run was not watched to its end") }
    if (-not $allSamples.Count) {
        $verdict = 'no-data'
    } elseif (-not $uncal) {
        foreach ($f in $result.watch.flagged) { $reasons.Add("foreign process $($f.name) (pid $($f.pid)) at $($f.maxPct)% > foreignCpuPctMax $foreignMax%") }
        $verdict = if ($flagged.Count) { 'flagged' } elseif (-not $exited) { 'incomplete' } else { 'clear' }
    }
}
if ($uncal) {
    $verdict = 'uncalibrated'
    $reasons.Insert(0, 'the budgets.md host key has null thresholds (not calibrated yet): blocked (host), never pass or fail')
}
if ($verdict -eq 'no-data') { $reasons.Add('no valid counter samples') }
$code = if ($verdict -eq 'clear') { 0 } else { 75 }

$result.verdict = $verdict
$result.exitCode = $code
$result.reasons = $reasons.ToArray()
$result.endedAt = (Get-Date).ToString('o')
$result.lanes = $lanes
$result.leftovers = $leftovers
$json = [pscustomobject]$result | ConvertTo-Json -Depth 8

$summary = 'hostload {0}: {1} (exit {2}); cpu {3} {4}% (max {5}), gpu3d {3} {6}% (max {7}); held lanes: {8}; leftover groups: {9}' -f
$result.mode, $verdict, $code, $stat, $result.cpuBusyPct.$stat, $result.cpuBusyPct.max, $result.gpu3dPct.$stat,
$result.gpu3dPct.max, ((@($lanes | Where-Object state -eq 'held' | ForEach-Object { "$($_.lane) ($($_.holder))" }) -join ', ') -replace '^$', 'none'),
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
