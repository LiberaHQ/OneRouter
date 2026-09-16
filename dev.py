#!/usr/bin/env python3
"""Build the site against a local gateway, then run both.

    python3 dev.py

Site on :4321, gateway on :8080. The build is pointed at the local gateway, so every
base URL on the site — the chat playground, the key page, every code snippet — refers
to the gateway this script starts. Ctrl-C stops both.

For a production build, run `python3 site/build.py` on its own: with ONEROUTER_API
unset the base URL comes from docs/_nav.json.
"""

import os
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITE_PORT = int(os.environ.get("SITE_PORT", 4321))
GATEWAY_PORT = int(os.environ.get("GATEWAY_PORT", 8080))
# localhost rather than the IP: OAuth providers treat the two as different
# redirect URIs, and one spelling everywhere is one thing to register.
API = f"http://localhost:{GATEWAY_PORT}/v1"


def main() -> int:
    build = subprocess.run([sys.executable, "site/build.py"], cwd=ROOT,
                           env={**os.environ, "ONEROUTER_API": API})
    if build.returncode:
        return build.returncode

    procs = [
        subprocess.Popen([sys.executable, "gateway/server.py", str(GATEWAY_PORT)], cwd=ROOT),
        subprocess.Popen([sys.executable, "serve.py", str(SITE_PORT)], cwd=ROOT),
    ]
    print(f"\n  site     http://localhost:{SITE_PORT}")
    print(f"  gateway  {API}")
    print("  Ctrl-C to stop both.\n")

    def stop(*_):
        for p in procs:
            p.terminate()
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    for p in procs:
        p.wait()
    return 0


if __name__ == "__main__":
    sys.exit(main())
