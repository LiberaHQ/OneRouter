#!/usr/bin/env python3
"""Dev server for the built site.

Maps clean URLs onto the generated tree the way a static host would: /docs/models
serves docs/models/index.html, and /docs/models.md serves the Markdown beside it.
"""

import http.server
import io
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "public"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".md": "text/markdown; charset=utf-8",
                      ".txt": "text/plain; charset=utf-8"}

    def _resolve(self, path: str) -> Path | None:
        clean = path.split("?", 1)[0].split("#", 1)[0].lstrip("/")
        # Refuse traversal before touching the filesystem.
        target = (ROOT / clean).resolve()
        if not target.is_relative_to(ROOT):
            return None
        if target.is_dir():
            target = target / "index.html"
        elif not target.exists() and not Path(clean).suffix:
            target = ROOT / clean / "index.html"
        return target if target.is_file() else None

    def translate_path(self, path):
        found = self._resolve(path)
        return str(found or ROOT / "404.html")

    def send_head(self):
        # A missing page must answer 404, not 200 with the 404 page in the body --
        # otherwise a crawler or a link checker records every typo as a live URL.
        if self._resolve(self.path) is None:
            body = (ROOT / "404.html").read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return io.BytesIO(body)
        return super().send_head()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4321
    if not ROOT.exists():
        sys.exit("public/ is missing -- run: python3 site/build.py")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", port), Handler) as httpd:
        print(f"OneRouter site on http://127.0.0.1:{port}")
        httpd.serve_forever()
