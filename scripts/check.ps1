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
