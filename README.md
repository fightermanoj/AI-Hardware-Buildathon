# 🎹 Cyber-Synth Air-1 — Gesture-Controlled Air Synthesizer

> **AI Hardware Buildathon Project** — A real-time hand gesture-controlled synthesizer that uses MediaPipe hand landmark tracking and Web Audio API to turn your hand movements into music.

![Status](https://img.shields.io/badge/status-live-brightgreen) ![Tech](https://img.shields.io/badge/tech-MediaPipe%20%2B%20Web%20Audio-blue) ![Platform](https://img.shields.io/badge/platform-Browser-orange)

---

## 🎯 What It Does

Use your **bare hands** in front of a webcam to play synthesizer chords, save chord sequences, and loop them — no physical instrument needed.

### Gesture Controls

| Gesture | Hand | Action |
|---------|------|--------|
| **1-5 Fingers** | Right | Select chord (Fmaj7 Low → Amaj7 Low → Fmaj7 Mid → Amaj7 Mid → Fmaj7 High) |
| **Open Palm** | Right | **L** — Toggle loop playback of saved chord chain |
| **Fist** | Left | **G** — Stamp/save current chord to chain + slide for pitch bend (X) and filter cutoff (Y) |
| **Open Palm** | Left | Idle |

### Chord Presets

| Fingers | Chord | Frequencies (Hz) |
|---------|-------|-------------------|
| 1 | Fmaj7 Low | F2, A2, C3, E3 |
| 2 | Amaj7 Low | A2, C#3, E3, G#3 |
| 3 | Fmaj7 Mid | F3, A3, C4, E4 |
| 4 | Amaj7 Mid | A3, C#4, E4, G#4 |
| 5 | Fmaj7 High | F4, A4, C5, E5 |

---

### Unified Launcher (Recommended)

You can launch the entire project with a single Python script. It automatically installs dependencies (`pygame`, `numpy`), hosts the local server, and opens your browser:

```bash
# Run the unified script
python run.py
```

### Manual Run

```bash
# 1. Start a local server
python -m http.server 8080

# 2. Open in browser
# http://localhost:8080
```

### Requirements
- Python 3.x
- Modern web browser (Chrome/Edge recommended) with webcam access
- Webcam

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                  BROWSER                         │
│                                                  │
│  ┌──────────┐    ┌──────────────┐   ┌────────┐  │
│  │ Webcam   │───▶│  MediaPipe   │──▶│Gesture │  │
│  │ Stream   │    │  Hand        │   │Evaluate│  │
│  └──────────┘    │  Landmarker  │   └───┬────┘  │
│                  └──────────────┘       │        │
│                                        ▼        │
│  ┌──────────┐    ┌──────────────┐   ┌────────┐  │
│  │ Speaker  │◀───│  Web Audio   │◀──│ Chord  │  │
│  │ Output   │    │  API Engine  │   │ Chain  │  │
│  └──────────┘    └──────────────┘   │ & Loop │  │
│                                     └────────┘  │
└─────────────────────────────────────────────────┘
```

### Tech Stack
- **Vision**: [MediaPipe Hand Landmarker](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) (GPU-accelerated, runs in browser via WASM)
- **Audio**: Web Audio API with multi-oscillator chord synthesis (sawtooth + square wave mix)
- **Frontend**: Vanilla HTML/CSS/JS — no build tools, no frameworks
- **Effects**: Biquad lowpass filter, ADSR envelope, delay/echo

---

## 📁 Project Structure

```
├── index.html      # Main UI layout with dashboard controls
├── app.js          # Core engine: MediaPipe tracking + Web Audio synthesis + gesture mapping
├── style.css       # Cyberpunk-themed dark UI styling
├── run.py          # Unified launcher (auto-installs requirements, starts web server, opens browser)
├── synth.py        # Python prototype (used for initial testing with pygame)
└── README.md       # This file
```

### About `synth.py` (Python Prototype)

The Python file (`synth.py`) was our **initial prototype** used for rapid testing of the chord definitions, sequencer logic, and audio generation using `pygame` and `numpy`. It served as a proof-of-concept to:

- Validate chord frequency combinations (Fmaj7/Amaj7 voicings)
- Test the G (save) and L (loop) workflow with keyboard controls
- Prototype the sawtooth + square wave mix and low-pass filter

The final product is the **web app** (`index.html` + `app.js`) which replaces keyboard input with real-time hand gesture recognition via MediaPipe.

---

## 🎛️ Dashboard Features

- **Chord Preset Selector** — Visual buttons for all 5 chord presets
- **Frequency Parameters** — Octave and detune controls
- **Biquad Lowpass Filter** — Cutoff frequency and resonance (Q) sliders
- **ADSR Envelope** — Attack, Decay, Sustain, Release with real-time visualization
- **Echo/Delay Effect** — Feedback loop and echo time controls
- **Oscilloscope** — Real-time waveform display color-coded by active chord
- **Hand Tracking Overlay** — Live skeleton rendering with gesture status readouts
- **Loop Chain Display** — Shows saved chord sequence and current playback position

---

## 🎵 How the Chord Loop System Works

1. **Select a chord** — Right hand: show 1-5 fingers
2. **Save it** — Left hand: make a fist (G stamp)
3. **Select another chord** — Right hand: change finger count
4. **Save again** — Left hand: fist again
5. **Start the loop** — Right hand: open palm (L toggle)
6. **Each saved chord plays for 1 second**, cycling continuously

---

## 👥 Team

Built at the **AI Hardware Buildathon**

---

## 📄 License

MIT License — feel free to fork, remix, and build on this!
