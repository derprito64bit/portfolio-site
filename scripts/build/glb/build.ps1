<#
.SYNOPSIS
  Camera GLB build (W-C13): Blender build script -> raw exports -> pivot-safe optimize -> public/models, then the
  rig contract and glbstat.

.DESCRIPTION
  1. Makes the static Bricolage instance for the [d64] strap tag (scripts/build/glb/mono_font.py through uvx,
     fonttools 4.66.1 as in deps.md) in $AssetsDir\cache.
  2. Takes the blender lane (scripts/fleet/lane.ps1), runs assets-src/3d/camera_xt/build_camera.py headless with
     Blender 5.0 (the script runs -GpuScript first: GPU only, D-012), releases the lane.
     Raw exports land in assets-src/3d/camera_xt/export/. The .blend and the texture cache stay OUTSIDE the repos
     ($AssetsDir\blend, $AssetsDir\cache\tex).
  3. node scripts/build/glb/optimize.mjs   raw exports -> public/models/*.glb (meshopt, pivot-safe steps)
  4. node scripts/build/glb/rig.mjs        assets-src/3d/camera_xt/rig.json (names, original transforms, verbs)
  5. node scripts/build/glb/glbstat.mjs    tris, draws, kB raw/gz/br of every shipped GLB

  -SkipBlender re-runs steps 3 to 5 from the committed raw exports (no Blender, no lane).

.EXAMPLE
  powershell -File scripts/build/glb/build.ps1
  powershell -File scripts/build/glb/build.ps1 -SkipBlender
  powershell -File scripts/build/glb/build.ps1 -GpuScript D:\fork\scripts\fork\blender_gpu.py
#>
[CmdletBinding()]
param(
    [string]$Blender = 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe',
    [string]$GpuScript = $(if ($env:ION_BLENDER_GPU) { $env:ION_BLENDER_GPU } else { Join-Path $HOME 'Documents\GitHub\project.ion\.claude\worktrees\overhaul\scripts\fork\blender_gpu.py' }),
    [string]$Agent = 'w-c13',
    [string]$AssetsDir = $(if ($env:ION_ASSETS) { $env:ION_ASSETS } else { Join-Path $HOME 'Documents\GitHub\portfolio-assets\xt5' }),
    [int]$LaneTimeoutMinutes = 1,
    [switch]$SkipBlender
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$src = Join-Path $repo 'assets-src\3d\camera_xt'
$lane = Join-Path $repo 'scripts\fleet\lane.ps1'
$cache = Join-Path $AssetsDir 'cache'

if (-not $SkipBlender) {
    if (-not (Test-Path $Blender)) { throw "Blender not found at $Blender" }
    if (-not (Test-Path $GpuScript)) { throw "GPU script not found at $GpuScript (D-012); pass -GpuScript or set ION_BLENDER_GPU" }
    New-Item -ItemType Directory -Force (Join-Path $AssetsDir 'blend'), (Join-Path $cache 'tex') | Out-Null
    $mono = Join-Path $cache 'bricolage-mono-800.ttf'
    uvx --from 'fonttools[woff]==4.66.1' --with brotli==1.2.0 python (Join-Path $PSScriptRoot 'mono_font.py') $mono
    if ($LASTEXITCODE -ne 0) { throw 'mono_font.py failed' }
    powershell -NoProfile -File $lane acquire blender -Agent $Agent -TimeoutMinutes $LaneTimeoutMinutes
    if ($LASTEXITCODE -ne 0) { throw "The blender lane is busy (exit $LASTEXITCODE). Retry later." }
    try {
        & $Blender -b --factory-startup --python (Join-Path $src 'build_camera.py') -- `
            --gpu-script $GpuScript --out (Join-Path $src 'export') `
            --blend (Join-Path $AssetsDir 'blend\camera_xt.blend') --tex (Join-Path $cache 'tex') `
            --mono-font $mono --report (Join-Path $cache 'build_report.json')
        if ($LASTEXITCODE -ne 0) { throw "Blender exited with $LASTEXITCODE" }
    } finally {
        powershell -NoProfile -File $lane release blender -Agent $Agent
    }
}

Push-Location $repo
try {
    node scripts/build/glb/optimize.mjs
    if ($LASTEXITCODE -ne 0) { throw 'optimize.mjs failed' }
    node scripts/build/glb/rig.mjs
    if ($LASTEXITCODE -ne 0) { throw 'rig.mjs failed' }
    node scripts/build/glb/glbstat.mjs (Get-ChildItem public/models/*.glb | ForEach-Object { $_.FullName })
    if ($LASTEXITCODE -ne 0) { throw 'glbstat.mjs failed' }
} finally {
    Pop-Location
}
