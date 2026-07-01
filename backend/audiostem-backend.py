#!/usr/bin/env python3
"""PyInstaller entry point for the AudioStem backend.

In production this script is bundled into a self-contained folder by PyInstaller
and shipped inside the Tauri application resources. The Tauri shell launches the
resulting executable and the backend listens on 127.0.0.1:8000.
"""

import multiprocessing

import uvicorn

if __name__ == "__main__":
    # Separation workers run in threads (see app/services/separator.py), so no
    # process is spawned. freeze_support() is kept as harmless hygiene in case any
    # dependency ever starts a multiprocessing child in the frozen build — without
    # it, such a child would re-launch this executable and restart uvicorn.
    multiprocessing.freeze_support()

    # When frozen by PyInstaller, the executable directory already contains the
    # extracted `app` package, so no additional path manipulation is required.
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        access_log=True,
    )
