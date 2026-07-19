import os
import sys
import subprocess
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

def install_gradio():
    print("Checking for gradio installation...")
    try:
        import gradio
        print("Gradio is already installed.")
    except ImportError:
        print("Installing gradio...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "gradio"])
            print("Successfully installed gradio!")
        except Exception as e:
            print(f"Error installing gradio: {e}")
            print("Please run: pip install gradio manually.")

def main():
    install_gradio()
    import gradio as gr
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    print("Initializing Gradio app container...")
    
    # We define a simple Gradio UI containing a direct redirect or landing page
    # linking to our mounted static app.
    with gr.Blocks(title="Cyber-Synth Air-1") as demo:
        gr.Markdown("""
        # 🎹 Cyber-Synth Air-1 (Gesture-Controlled Air Synthesizer)
        
        Click the link below to open the full-screen interactive interface with webcam and Web Audio support.
        
        ### ➡️ [OPEN FULL-SCREEN SYNTH INTERFACE](/synth/)
        
        *Note: If accessing via the public `.gradio.live` link, the full-screen link will preserve your session and run correctly.*
        """)
        
    # Mount the local folder directly under the FastAPI app exposed by Gradio.
    # This avoids script innerHTML issues and serves the raw HTML, CSS, and JS natively!
    demo.app.mount("/synth", StaticFiles(directory=script_dir, html=True), name="synth")
    
    # Add a redirect from the root path if someone wants to auto-redirect,
    # but keeping Gradio's index page is useful for the share link landing.
    
    # Launch Gradio and generate the public share link (.gradio.live)
    demo.launch(share=True)

if __name__ == "__main__":
    main()
