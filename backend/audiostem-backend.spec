# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for bundling the AudioStem Python backend.

Produces a one-folder bundle at dist/audiostem-backend/ that can be copied into
src-tauri/resources/audiostem-backend/ and shipped with the Tauri application.
"""

from pathlib import Path

import torch
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None

spec_dir = Path(SPECPATH)
repo_root = spec_dir.parent
entry_script = spec_dir / "audiostem-backend.py"
app_package = spec_dir / "app"

# Include torch's native libraries explicitly so the bundled executable can load
# them without requiring a system-wide PyTorch installation.
torch_lib = Path(torch.__file__).parent / "lib"

a = Analysis(
    [str(entry_script)],
    pathex=[str(spec_dir)],
    binaries=[(str(torch_lib), "torch/lib")] if torch_lib.exists() else [],
    datas=[(str(app_package), "app")] + collect_data_files("demucs"),
    hiddenimports=[
        # ASGI / web stack
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "fastapi",
        "fastapi.middleware.cors",
        "fastapi.responses",
        "starlette",
        "pydantic",
        "pydantic_settings",
        # Database
        "sqlalchemy",
        "sqlalchemy.ext.baked",
        "alembic",
        "alembic.runtime.migration",
        "alembic.script.base",
        "alembic.util.messaging",
        # AI / audio
        "demucs",
        "demucs.api",
        "demucs.apply",
        "demucs.audio",
        "demucs.pretrained",
        "demucs.separate",
        "demucs.states",
        "demucs.utils",
        "torch",
        "torchaudio",
        "torchaudio.transforms",
        "soundfile",
        "soundfile._soundfile_data",
        "lameenc",
        "mutagen",
        # Utilities used by routers / services
        "rich",
        "httpx",
        "aiofiles",
        "python_multipart",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="audiostem-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="audiostem-backend",
)
