# Serves CRATE's folder on http://127.0.0.1:8790/ for the tests, telling the browser not to keep copies, so a test run always
# uses the files as they are now (python -m http.server lets the browser reuse an old script after you change it).
# Run from anywhere: python tests/serve.py   (then open http://127.0.0.1:8790/tests/)
import http.server, os, sys

class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
print(f'CRATE on http://127.0.0.1:{port}/  - tests at http://127.0.0.1:{port}/tests/')
http.server.ThreadingHTTPServer(('127.0.0.1', port), NoStore).serve_forever()
