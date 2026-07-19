import os
import sys
import subprocess
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler
import socketserver

PORT = 8080

def install_dependencies():
    print("Checking dependencies...")
    try:
        import pygame
        import numpy
        print("Dependencies already satisfied.")
    except ImportError:
        print("Installing pygame and numpy...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "pygame", "numpy"])
            print("Successfully installed pygame and numpy!")
        except Exception as e:
            print(f"Error installing dependencies: {e}")
            print("Please run: pip install pygame numpy manually.")

class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True

def start_web_server():
    handler = SimpleHTTPRequestHandler
    # Run in the directory of the script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    try:
        with ThreadingHTTPServer(("", PORT), handler) as httpd:
            print(f"\n[SERVER] Serving at http://localhost:{PORT}")
            httpd.serve_forever()
    except Exception as e:
        print(f"[SERVER ERROR] Failed to start server: {e}")

def main():
    print("==================================================")
    print("   🎹 CYBER-SYNTH AIR-1 UNIFIED LAUNCHER 🎹   ")
    print("==================================================")
    
    # 1. Install pip requirements automatically
    install_dependencies()
    
    # 2. Start the HTTP Web Server on a background thread
    server_thread = threading.Thread(target=start_web_server, daemon=True)
    server_thread.start()
    
    # Give the server a moment to start
    time.sleep(1)
    
    # 3. Open the web browser
    print(f"\n[LAUNCH] Opening Web Browser to http://localhost:{PORT}")
    webbrowser.open(f"http://localhost:{PORT}")
    
    print("\n--------------------------------------------------")
    print("Select an option:")
    print("  [1] Keep running Web App and view logs")
    print("  [2] Run the Python pygame prototype (synth.py)")
    print("  [3] Exit")
    print("--------------------------------------------------")
    
    try:
        while True:
            choice = input("Enter choice (1-3): ").strip()
            if choice == '1':
                print("\n[INFO] Web app is running. Press Ctrl+C to stop.")
                while True:
                    time.sleep(1)
            elif choice == '2':
                print("\n[LAUNCH] Running synth.py...")
                script_dir = os.path.dirname(os.path.abspath(__file__))
                synth_path = os.path.join(script_dir, "synth.py")
                if os.path.exists(synth_path):
                    subprocess.run([sys.executable, synth_path])
                else:
                    print("[ERROR] synth.py not found in current directory.")
            elif choice == '3':
                print("\nExiting. Goodbye!")
                sys.exit(0)
            else:
                print("Invalid choice, please enter 1, 2, or 3.")
    except KeyboardInterrupt:
        print("\nExiting. Goodbye!")
        sys.exit(0)

if __name__ == "__main__":
    main()
