#!/usr/bin/env bash
# Local build script for the AudioStem Tauri desktop application.
# Bundles the Python backend with PyInstaller, builds the React frontend,
# and then invokes `cargo tauri build`.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
SRC_TAURI_DIR="$REPO_ROOT/src-tauri"
RESOURCES_DIR="$SRC_TAURI_DIR/resources"
BACKEND_BUNDLE_DIR="$RESOURCES_DIR/audiostem-backend"

SKIP_BACKEND=false
SKIP_FRONTEND=false
SKIP_TAURI=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-backend)  SKIP_BACKEND=true; shift ;;
    --skip-frontend) SKIP_FRONTEND=true; shift ;;
    --skip-tauri)    SKIP_TAURI=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

step() {
  echo "==> $1"
}

# ---------------------------------------------------------------------------
# Backend bundle
# ---------------------------------------------------------------------------
if [[ "$SKIP_BACKEND" != true ]]; then
  step "Bundling Python backend with PyInstaller"

  VENV_DIR="$BACKEND_DIR/.venv"
  if [[ ! -d "$VENV_DIR" ]]; then
    python3 -m venv "$VENV_DIR"
  fi

  # shellcheck source=/dev/null
  source "$VENV_DIR/bin/activate"
  python -m pip install --upgrade pip
  python -m pip install -r "$BACKEND_DIR/requirements.txt"
  python -m pip install pyinstaller

  (
    cd "$BACKEND_DIR"
    pyinstaller audiostem-backend.spec --clean --noconfirm
  )

  step "Copying backend bundle to Tauri resources"
  rm -rf "$BACKEND_BUNDLE_DIR"
  mkdir -p "$BACKEND_BUNDLE_DIR"
  cp -R "$BACKEND_DIR/dist/audiostem-backend/"* "$BACKEND_BUNDLE_DIR/"
fi

# ---------------------------------------------------------------------------
# Frontend build
# ---------------------------------------------------------------------------
if [[ "$SKIP_FRONTEND" != true ]]; then
  step "Building React frontend"
  (
    cd "$FRONTEND_DIR"
    npm install
    npm run build
  )
fi

# ---------------------------------------------------------------------------
# Tauri build
# ---------------------------------------------------------------------------
if [[ "$SKIP_TAURI" != true ]]; then
  step "Building Tauri application"
  (
    cd "$REPO_ROOT"
    cargo tauri build
  )
fi

echo "Build complete."
