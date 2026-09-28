"""Resolve writable locations for runtime state.

The application keeps mutable state (session secret, authentication database,
operational database) next to the project by default, which is what a local
checkout wants. Serverless platforms mount the project read-only and only
allow writes under the system temporary directory, so those defaults fail with
``[Errno 30] Read-only file system``.

``writable_dir`` returns the preferred directory when it can be created and
falls back to the temporary directory otherwise, so the same image runs
unmodified in both places. An explicit environment variable always wins.
"""
from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path

LOGGER = logging.getLogger(__name__)


def writable_dir(preferred: Path | str) -> Path:
    """Return `preferred` if files can be created in it, else a temp directory.

    The directory is probed by actually creating a file: ``mkdir`` with
    ``exist_ok=True`` succeeds on an existing read-only directory, so a
    directory-only check would wrongly accept a read-only mount.
    """
    candidate = Path(preferred)
    try:
        candidate.mkdir(parents=True, exist_ok=True)
        probe = candidate / f".dineiq-write-probe-{os.getpid()}"
        probe.touch()
        probe.unlink()
        return candidate
    except OSError as exc:
        fallback = Path(tempfile.gettempdir()) / candidate.name
        try:
            fallback.mkdir(parents=True, exist_ok=True)
            probe = fallback / f".dineiq-write-probe-{os.getpid()}"
            probe.touch()
            probe.unlink()
        except OSError:
            fallback = Path(tempfile.mkdtemp(prefix="dineiq-"))
        LOGGER.warning(
            "Cannot use %s (%s); using %s instead. Set the matching "
            "environment variable to a persistent path to keep this data "
            "across restarts.", candidate, exc.strerror or exc, fallback)
        return fallback


def resolve_db_path(variable: str, preferred: Path | str) -> Path:
    """Resolve a database path, honouring an explicit environment override."""
    configured = os.environ.get(variable)
    if configured:
        return Path(configured)
    return writable_dir(Path(preferred).parent) / Path(preferred).name
