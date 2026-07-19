import pygame
import numpy as np
import sys

# Initialize Pygame and its mixer
pygame.init()
pygame.mixer.init(frequency=44100, size=-16, channels=1, buffer=512)

# Configuration Constants
SAMPLE_RATE = 44100
DURATION = 0.1  
VOLUME = 0.3
BEAT_DURATION_FRAMES = 60  # 60 frames = 1 second at 60fps (each chord plays for 1 sec)

# Chord Definitions: Fmaj7 -> Amaj7 transitions
CHORDS = {
    # Low Row
    pygame.K_KP7: [87.31, 110.00, 130.81, 146.83],   # Fmaj7 Low (F2, A2, C3, E3)
    pygame.K_KP8: [110.00, 138.59, 164.81, 207.65],  # Amaj7 Low (A2, C#3, E3, G#3)
    
    # Mid Row
    pygame.K_KP4: [174.61, 220.00, 261.63, 329.63],  # Fmaj7 Mid (F3, A3, C4, E4)
    pygame.K_KP5: [220.00, 277.18, 329.63, 415.30],  # Amaj7 Mid (A3, C#4, E4, G#4)
    
    # High Row
    pygame.K_KP1: [349.23, 440.00, 523.25, 659.25],  # Fmaj7 High (F4, A4, C5, E5)
    pygame.K_KP2: [440.00, 554.37, 659.25, 830.61]   # Amaj7 High (A4, C#5, E5, G#5)
}

# Chord name lookup for display
CHORD_NAMES = {
    pygame.K_KP7: "Fmaj7 Low",
    pygame.K_KP8: "Amaj7 Low",
    pygame.K_KP4: "Fmaj7 Mid",
    pygame.K_KP5: "Amaj7 Mid",
    pygame.K_KP1: "Fmaj7 High",
    pygame.K_KP2: "Amaj7 High",
}

def generate_wave(frequencies, filter_cutoff):
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), False)
    wave = np.zeros_like(t)
    
    if not frequencies:
        return np.zeros(int(SAMPLE_RATE * DURATION), dtype=np.int16)
        
    for f in frequencies:
        saw = 2 * (f * t - np.floor(0.5 + f * t))
        sq = np.sign(np.sin(2 * np.pi * f * t))
        wave += (saw * 0.7) + (sq * 0.3)
        
    wave = wave / len(frequencies)
    
    # Low Pass Filter
    if filter_cutoff < 0.95:
        window_size = max(1, int(15 * (1.0 - filter_cutoff)))
        wave = np.convolve(wave, np.ones(window_size) / window_size, mode='same')

    audio = (wave * VOLUME * 32767).astype(np.int16)
    return audio

def main():
    screen = pygame.display.set_mode((400, 300))
    pygame.display.set_caption("Fmaj7 -> Amaj7 Synth")
    
    clock = pygame.time.Clock()
    y_axis_mod = 0.5  
    pitch_bend = 1.0  
    
    # G key: saves chord data into a list (does NOT play it)
    saved_chords = []       # List of {"freqs": [...], "name": "..."}
    last_played_freqs = []  # The chord user last pressed on numpad
    last_played_name = ""
    
    # L key: loops through all saved chords, 1 sec each
    looping = False
    loop_index = 0          # Which saved chord is currently playing
    loop_tick = 0           # Frame counter (counts up to BEAT_DURATION_FRAMES)
    
    print("=== Fmaj7 -> Amaj7 SYNTH ===")
    print("Chords (Numpad):")
    print("  Low:  7 (Fmaj7) | 8 (Amaj7)")
    print("  Mid:  4 (Fmaj7) | 5 (Amaj7)")
    print("  High: 1 (Fmaj7) | 2 (Amaj7)")
    print("---------------------------------")
    print("  G = Save current chord (stamp it)")
    print("  L = Loop all saved chords (1 sec each)")
    print("  C = Clear all saved chords")
    print("  W/S = Filter | A/D = Pitch Bend")
    print("  ESC = Quit")
    print("")

    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()
            
            if event.type == pygame.KEYDOWN:
                # Track which chord the user pressed on numpad
                for key, freqs in CHORDS.items():
                    if event.key == key:
                        last_played_freqs = freqs[:]
                        last_played_name = CHORD_NAMES.get(key, "?")
                        break
                
                # G = save the last played chord into the list
                if event.key == pygame.K_g:
                    if last_played_freqs:
                        saved_chords.append({
                            "freqs": last_played_freqs[:],
                            "name": last_played_name
                        })
                        n = len(saved_chords)
                        print(f"[G SAVED #{n}] {last_played_name}")
                        # Show the full chain
                        names = " -> ".join([c["name"] for c in saved_chords])
                        print(f"  Chain: {names}")
                    else:
                        print("[G] Play a chord on numpad first, then press G.")
                
                # L = start/stop looping through saved chords
                elif event.key == pygame.K_l:
                    if looping:
                        looping = False
                        print("[L STOP] Loop stopped.")
                    elif len(saved_chords) > 0:
                        looping = True
                        loop_index = 0
                        loop_tick = 0
                        names = " -> ".join([c["name"] for c in saved_chords])
                        print(f"[L LOOP] Playing: {names}  (1 sec each)")
                    else:
                        print("[L] No chords saved. Press G to save some first.")
                
                # C = clear saved chords
                elif event.key == pygame.K_c:
                    saved_chords = []
                    looping = False
                    loop_index = 0
                    loop_tick = 0
                    print("[C] All saved chords cleared.")
                
        keys = pygame.key.get_pressed()
        if keys[pygame.K_ESCAPE]:
            break
        
        # --- Determine which frequencies to play ---
        active_chord_freqs = []
        
        # Priority 1: Loop playback
        if looping and len(saved_chords) > 0:
            # Play the current chord in the loop
            active_chord_freqs = saved_chords[loop_index]["freqs"]
            loop_tick += 1
            # After 1 second (BEAT_DURATION_FRAMES), move to next chord
            if loop_tick >= BEAT_DURATION_FRAMES:
                loop_tick = 0
                loop_index = (loop_index + 1) % len(saved_chords)
        
        # Priority 2: Live numpad input (play while not looping)
        else:
            for key, freqs in CHORDS.items():
                if keys[key]:
                    active_chord_freqs = freqs
                    break
                
        # WASD Joystick Processing
        if keys[pygame.K_w]:
            y_axis_mod = min(1.0, y_axis_mod + 0.05)
        elif keys[pygame.K_s]:
            y_axis_mod = max(0.1, y_axis_mod - 0.05)
            
        if keys[pygame.K_d]:
            pitch_bend = min(1.1, pitch_bend + 0.01)  
        elif keys[pygame.K_a]:
            pitch_bend = max(0.9, pitch_bend - 0.01)  
        else:
            if pitch_bend > 1.0: pitch_bend = max(1.0, pitch_bend - 0.02)
            elif pitch_bend < 1.0: pitch_bend = min(1.0, pitch_bend + 0.02)

        final_freqs = [f * pitch_bend for f in active_chord_freqs]
        audio_chunk = generate_wave(final_freqs, y_axis_mod)
        sound = pygame.mixer.Sound(buffer=audio_chunk)
        sound.play()
        
        clock.tick(60)

if __name__ == "__main__":
    main()