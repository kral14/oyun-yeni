import http.server
import os
import socket
import sys
import threading
import time
import webbrowser
import shutil
import subprocess
import platform
from functools import partial


def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # This does not need to be reachable; it's only to pick the right NIC
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class NoCacheRequestHandler(http.server.SimpleHTTPRequestHandler):
    # Serve files relative to the working directory
    def do_GET(self):
        # Lightweight health check for testing from mobile: /__health -> 200 OK
        if self.path in ("/__health", "/health", "/_health"):
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"OK")
            return
        return super().do_GET()

    def end_headers(self):
        # Disable caching to always get latest assets on mobile
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # Basic CORS to make local testing easier (e.g., image/audio)
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, format: str, *args) -> None:
        # Prefix logs with client IP to easily see mobile hits
        try:
            client_ip = self.client_address[0]
        except Exception:
            client_ip = "?"
        sys.stderr.write(f"[{client_ip}] " + (format % args) + "\n")


def maybe_add_firewall_rule(port: int) -> None:
    if platform.system() != "Windows":
        return
    pwsh = shutil.which("powershell")
    if not pwsh:
        return
    name = f"TD Local {port}"
    cmd = (
        f"$name='{name}'; $rule=Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue; "
        f"if(-not $rule){{ New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort {port} -Profile Private,Domain | Out-Null }} "
        f"else{{ Set-NetFirewallRule -DisplayName $name -Enabled True -Profile Private,Domain | Out-Null }}"
    )
    try:
        subprocess.run([pwsh, '-NoProfile', '-Command', cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def run(port: int) -> None:
    # Serve from script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    handler_cls = partial(NoCacheRequestHandler, directory=script_dir)
    # Threading server to handle multiple parallel requests smoothly
    with http.server.ThreadingHTTPServer(("0.0.0.0", port), handler_cls) as httpd:
        httpd.daemon_threads = True
        maybe_add_firewall_rule(port)
        lan_ip = get_lan_ip()
        print("================================================")
        print(" Local Python server started (ThreadingHTTPServer)")
        print(f" Address (LAN):  http://{lan_ip}:{port}/")
        print(f" Address (Local): http://127.0.0.1:{port}/")
        print()
        print(" Open on your phone (same Wi-Fi):")
        print(f"   Game:            http://{lan_ip}:{port}/index.html")
        print(f"   Responsive Test: http://{lan_ip}:{port}/responsive-test.html")
        print("================================================")
        # Auto-open browser locally after short delay
        def _open():
            try:
                webbrowser.open(f"http://127.0.0.1:{port}/index.html")
            except Exception:
                pass
        threading.Timer(1.2, _open).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    try:
        port = int(os.environ.get("PORT", "8080"))
    except ValueError:
        print("Invalid PORT env, falling back to 8080", file=sys.stderr)
        port = 8080
    run(port)


