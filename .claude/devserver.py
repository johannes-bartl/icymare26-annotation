"""Static server for local development.

python -m http.server caches aggressively enough that an edited .js keeps being
served from the browser cache, which makes "did my change land?" impossible to
answer. This is the same server with caching turned off.

Not part of the site - GitHub Pages serves the files directly.
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print('serving on http://localhost:%d (no-store)' % port)
    ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
