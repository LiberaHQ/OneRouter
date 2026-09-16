"""Reads `.env` into the environment before anything else looks at it.

Secrets — OAuth client secrets, the Arc master seed, SMTP passwords — belong in one
untracked file rather than in source or in a shell history. Values already set in the
real environment always win, so a deployment can override the file without editing it.

Called at the top of `server.py`, before the modules that read their configuration at
import time.
"""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT = Path(__file__).resolve().parent.parent / ".env"


def load(path: Path | None = None) -> list[str]:
    """Loads KEY=VALUE lines. Returns the names it set, never the values."""
    target = path or DEFAULT
    if not target.exists():
        return []
    applied = []
    for raw in target.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, _, value = line.partition("=")
        name = name.strip()
        value = value.strip().strip('"').strip("'")
        if name and name not in os.environ:
            os.environ[name] = value
            applied.append(name)
    return applied
