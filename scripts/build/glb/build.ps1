<#
.SYNOPSIS
  Camera GLB build (W-C13): Blender build script -> raw exports -> pivot-safe optimize -> public/models, then the
  rig contract and glbstat.

.DESCRIPTION
  1. Takes the blender lane (scripts/fleet/lane.ps1), runs assets-src/3d/camera_xt/build_camera.py headless with
     Blender 5.0 (the script runs scripts/fork/blender_gpu.py first: GPU only, D-012), releases the lane.
     Raw exports land in assets-src/3d/camera_xt/export/. The .blend goes OUTSIDE the repo ($AssetsDir\blend).
  2. node scripts/build/glb/optimize.mjs   raw exports -> public/models/*.glb (meshopt, pivot-safe flags)
  3. node scripts/build/glb/rig.mjs        assets-src/3d/camera_xt/rig.json (names, original transforms, verbs)
  4. node scripts/build/glb/glbstat.mjs    tris, draws, kB raw/gz/br of every shipped GLB

  -SkipBlender re-runs steps 2 to 4 from the committed raw exports (no Blender, no lane).

.EXAMPLE
  powershell -File scripts/build/glb/build.ps1
  powershell -File scripts/build/glb/build.ps1 -SkipBlender
#>
[CmdletBinding()]
param(
    [string]$Blender = 'C:\Program Files\Blender Foundation\Blender 5.0\blender.exe',
    [string]$Agent = 'w-c13',
    [string]$AssetsDir = $(if ($env:ION_ASSETS) { $env:ION_ASSETS } else { Join-Path $HOME 'Documents\GitHub\portfolio-assets\xt5' }),
    [int]$LaneTimeoutMinutes = 1,
    [switch]$SkipBlender
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$src = Join-Path $repo 'assets-src\3d\camera_xt'
$lane = Join-Path $repo 'scripts\fleet\lane.ps1'

if (-not $SkipBlender) {
    if (-not (Test-Path $Blender)) { throw "Blender not found at $Blender" }
    New-Item -ItemType Directory -Force (Join-Path $AssetsDir 'blend') | Out-Null
    powershell -NoProfile -File $lane acquire blender -Agent $Agent -TimeoutMinutes $LaneTimeoutMinutes
    if ($LASTEXITCODE -ne 0) { throw "The blender lane is busy (exit $LASTEXITCODE). Retry later." }
    try {
        & $Blender -b --factory-startup --python (Join-Path $src 'build_camera.py') -- `
            --out (Join-Path $src 'export') --blend (Join-Path $AssetsDir 'blend\camera_xt.blend')
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
