#requires -Version 5.1
<#
.SYNOPSIS
    Local build script for the AudioStem Tauri desktop application.

.DESCRIPTION
    Bundles the Python backend with PyInstaller, builds the React frontend,
    and then invokes `cargo tauri build`. The resulting installer is written
    to src-tauri/target/release/bundle/.

.PARAMETER SkipBackend
    Skip the PyInstaller backend bundling step.

.PARAMETER SkipFrontend
    Skip the npm install / frontend build step.

.PARAMETER SkipTauri
    Skip the final Tauri build step.
#>
param(
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$SkipTauri
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$backendDir = Join-Path $repoRoot "backend"
$frontendDir = Join-Path $repoRoot "frontend"
$srcTauriDir = Join-Path $repoRoot "src-tauri"
$resourcesDir = Join-Path $srcTauriDir "resources"
$backendBundleDir = Join-Path $resourcesDir "audiostem-backend"

function Invoke-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# ---------------------------------------------------------------------------
# Backend bundle
# ---------------------------------------------------------------------------
if (-not $SkipBackend) {
    Invoke-Step "Bundling Python backend with PyInstaller"

    $venvDir = Join-Path $backendDir ".venv"
    $venvPython = Join-Path $venvDir (Join-Path "Scripts" "python.exe")
    $venvActivate = Join-Path $venvDir (Join-Path "Scripts" "Activate.ps1")

    if (-not (Test-Path $venvDir)) {
        python -m venv $venvDir
    }

    & $venvActivate
    python -m pip install --upgrade pip
    python -m pip install -r (Join-Path $backendDir "requirements.txt")
    python -m pip install pyinstaller

    Push-Location $backendDir
    try {
        pyinstaller audiostem-backend.spec --clean --noconfirm
    }
    finally {
        Pop-Location
    }

    Invoke-Step "Copying backend bundle to Tauri resources"
    if (Test-Path $backendBundleDir) {
        Remove-Item -Recurse -Force $backendBundleDir
    }
    New-Item -ItemType Directory -Force -Path $backendBundleDir | Out-Null
    Copy-Item -Path (Join-Path $backendDir "dist\audiostem-backend\*") -Destination $backendBundleDir -Recurse -Force
}

# ---------------------------------------------------------------------------
# Frontend build
# ---------------------------------------------------------------------------
if (-not $SkipFrontend) {
    Invoke-Step "Building React frontend"
    Push-Location $frontendDir
    try {
        npm install
        npm run build
    }
    finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Tauri build
# ---------------------------------------------------------------------------
if (-not $SkipTauri) {
    Invoke-Step "Building Tauri application"
    Push-Location $repoRoot
    try {
        cargo tauri build
    }
    finally {
        Pop-Location
    }
}

Write-Host "Build complete." -ForegroundColor Green
