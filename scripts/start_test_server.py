#!/usr/bin/env python3
"""
Simple HTTP test server for mobile testing
Serves test-mobile-fullscreen.html file from project root
"""

import http.server
import socketserver
import os
import sys
import socket
import platform

# Port (default: 8000)
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

# Project root dizini (script'in yukaridaki dizini)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# Server'i project root'da calistir
os.chdir(PROJECT_ROOT)

# IP adresini bul (telefondan baglanma icin)
def get_local_ip():
    """Local network IP adresini bul"""
    try:
        # Gercek IP'yi bulmak icin bir dummy socket aciyoruz
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# HTTP Server Handler
class TestServerHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # CORS headers ekle (mobil test icin)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # Cache kontrolu
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # Daha detaylı log ciktisi - telefon bağlantısını görmek için
        client_ip = self.address_string()
        # Telefondan gelen istekleri vurgula
        if client_ip != "127.0.0.1" and client_ip.startswith("192.168"):
            print(f"📱 TELEFON [{client_ip}] {format % args}")
        else:
            print(f"[{client_ip}] {format % args}")

# Server'i baslat
if __name__ == "__main__":
    local_ip = get_local_ip()
    
    print("=" * 50)
    print("  Test Server Baslatilir")
    print("=" * 50)
    print(f"\nPort: {PORT}")
    print(f"\nLocal URL:")
    print(f"  http://127.0.0.1:{PORT}/test-mobile-fullscreen.html")
    print(f"\nNetwork URL (Telefon icin):")
    print(f"  http://{local_ip}:{PORT}/test-mobile-fullscreen.html")
    print(f"\nNot: Telefondan baglanmak icin PC ve telefon ayni Wi-Fi aginda olmalidir!")
    print(f"\nDurdurmak icin: Ctrl+C")
    print("=" * 50)
    print()
    
    # Port kullanılabilir mi kontrol et
    def is_port_available(port):
        """Port kullanılabilir mi kontrol et"""
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("0.0.0.0", port))
            sock.close()
            return True
        except OSError:
            return False
    
    # Port meşgulse alternatif port öner
    if not is_port_available(PORT):
        print(f"\n⚠️  UYARI: Port {PORT} zaten kullanılıyor!")
        # Alternatif portları dene
        alt_ports = [8001, 8002, 8080, 8888, 9000]
        for alt_port in alt_ports:
            if is_port_available(alt_port):
                print(f"Alternatif port bulundu: {alt_port}")
                print(f"Kullanılıyor: Port {alt_port}")
                PORT = alt_port
                print(f"\nLocal URL: http://127.0.0.1:{PORT}/test-mobile-fullscreen.html")
                print(f"Network URL: http://{local_ip}:{PORT}/test-mobile-fullscreen.html")
                break
        else:
            print(f"\n❌ HATA: Tüm alternatif portlar da meşgul!")
            print(f"Lütfen mevcut server'ı durdurun veya başka bir port belirtin:")
            print(f"  python {sys.argv[0]} <PORT>")
            sys.exit(1)
    
    try:
        # SO_REUSEADDR ile port'u kullan (Windows için)
        class ReusableTCPServer(socketserver.TCPServer):
            allow_reuse_address = True
        
        # Tüm network interface'lerine bind et (0.0.0.0 = tüm IP'ler)
        with ReusableTCPServer(("0.0.0.0", PORT), TestServerHandler) as httpd:
            print(f"\n✅ Server başladı! Port: {PORT}")
            print(f"Server TÜM network interface'lerine bind edildi (0.0.0.0:{PORT})")
            print(f"\n📱 Telefondan bağlanmak için:")
            print(f"   http://{local_ip}:{PORT}/test-mobile-fullscreen.html")
            print(f"\n💡 İpucu: Telefondan bağlantı geldiğinde '📱 TELEFON' yazısı görünecek!")
            print(f"\nServer durdurulana kadar çalışacak...\n")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\nServer durduruldu.")
        sys.exit(0)
    except OSError as e:
        if "Address already in use" in str(e) or e.errno == 10048:
            print(f"\n❌ HATA: Port {PORT} zaten kullanılıyor!")
            print(f"Lütfen mevcut server'ı durdurun veya başka bir port belirtin:")
            print(f"  python {sys.argv[0]} <PORT>")
        else:
            print(f"\n❌ HATA: {e}")
        sys.exit(1)

