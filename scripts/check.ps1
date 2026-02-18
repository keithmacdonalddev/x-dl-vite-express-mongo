$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$packageJsonPath = Join-Path $root 'package.json'

if (-not (Test-Path $packageJsonPath)) {
  throw "Missing package.json at $packageJsonPath"
}

$package = Get-Content -Raw $packageJsonPath | ConvertFrom-Json
$requiredScripts = @('dev', 'build', 'test')

foreach ($name in $requiredScripts) {
  if (-not $package.scripts.$name) {
    throw "Missing npm script: $name"
  }
}

$requiredPaths = @(
  (Join-Path $root 'docs\testing-matrix.md'),
  (Join-Path $root 'scripts\dev.ps1')
)

foreach ($item in $requiredPaths) {
  if (-not (Test-Path $item)) {
    throw "Missing required file: $item"
  }
}

Write-Host "check.ps1: required package scripts and release docs exist."

# Module boundary check
Write-Host "check.ps1: running module boundary check..."
$boundaryScript = Join-Path $root 'scripts\check-module-boundaries.mjs'
if (-not (Test-Path $boundaryScript)) {
  throw "Missing boundary checker: $boundaryScript"
}
& node $boundaryScript
if ($LASTEXITCODE -ne 0) {
  throw "Module boundary violations detected. Fix imports before proceeding."
}
Write-Host "check.ps1: module boundaries OK."
