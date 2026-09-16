#!/usr/bin/env python3
"""Run every part of the project.

    python3 dev.py

Three processes, because the frontend is mid-migration:

    :4322  web/      Next.js — home, models, chat, signin, keys, pay
    :4321  public/   the Python build — docs, legal, llms.txt, sitemap
    :8080  gateway/  the API both frontends talk to

The Python site is still the only thing that renders the documentation, so it runs
alongside Next until the Markdown subset and its directives are ported. Both read the
same data/*.json and the same gateway, so what they show agrees.

Ctrl-C stops all three. For a production build of the site alone, run
`python3 site/build.py` with ONEROUTER_API unset.
"""

import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
SITE_PORT = int(os.environ.get("SITE_PORT", 4321))
WEB_PORT = int(os.environ.get("WEB_PORT", 4322))
GATEWAY_PORT = int(os.environ.get("GATEWAY_PORT", 8080))
API = f"http://localhost:{GATEWAY_PORT}/v1"


def node_bin() -> str | None:
    """npm, wherever it lives. Node is installed under ~/.local/node here rather than
    system-wide, so PATH alone is not enough to find it."""
    found = shutil.which("npm")
    if found:
        return found
    local = Path.home() / ".local" / "node" / "bin" / "npm"
    return str(local) if local.exists() else None


def main() -> int:
    build = subprocess.run([sys.executable, "site/build.py"], cwd=ROOT,
                           env={**os.environ, "ONEROUTER_API": API})
    if build.returncode:
        return build.returncode

    procs = [
        subprocess.Popen([sys.executable, "gateway/server.py", str(GATEWAY_PORT)], cwd=ROOT),
        subprocess.Popen([sys.executable, "serve.py", str(SITE_PORT)], cwd=ROOT),
    ]

    npm = node_bin()
    if npm and (WEB / "node_modules").exists():
        procs.append(subprocess.Popen(
            [npm, "run", "dev"], cwd=WEB,
            env={**os.environ,
                 "PATH": f"{Path(npm).parent}:{os.environ.get('PATH', '')}",
                 "NEXT_PUBLIC_GATEWAY_URL": API}))
    else:
        print("\n  web/: skipped — no npm, or run `npm install` in web/ first")

    print(f"\n  web (Next)  http://localhost:{WEB_PORT}")
    print(f"  docs (site) http://localhost:{SITE_PORT}/docs/quickstart")
    print(f"  gateway     {API}")
    print("  Ctrl-C to stop all of them.\n")

    def stop(*_):
        for proc in procs:
            proc.terminate()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    for proc in procs:
        proc.wait()
    return 0


if __name__ == "__main__":
    sys.exit(main())
