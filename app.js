import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/+esm";

// ============================================================
// Cyber-Synth Air-1: Chord-Based Gesture Synth Engine
// Right hand fingers = chord select, fist = G save
// Left hand fist = pitch bend + filter, open palm = L loop
// ============================================================

// --- Chord Definitions (mirroring synth.py) ---
const CHORD_PRESETS = [
  { name: "Fmaj7 Low",  freqs: [87.31, 110.00, 130.81, 146.83], color: "#00f3ff" },  // 1 finger
  { name: "Amaj7 Low",  freqs: [110.00, 138.59, 164.81, 207.65], color: "#ff005b" },  // 2 fingers
  { name: "Fmaj7 Mid",  freqs: [174.61, 220.00, 261.63, 329.63], color: "#ffb700" },  // 3 fingers
  { name: "Amaj7 Mid",  freqs: [220.00, 277.18, 329.63, 415.30], color: "#a855f7" },  // 4 fingers
  { name: "Fmaj7 High", freqs: [349.23, 440.00, 523.25, 659.25], color: "#22c55e" },  // 5 fingers
];

// --- Global Variables ---
let filesetResolver;
let handLandmarker;

// DOM Elements
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
const visualizerCanvas = document.getElementById('visualizer');
const visualizerCtx = visualizerCanvas.getContext('2d');
const adsrCanvas = document.getElementById('adsr-canvas');
const adsrCtx = adsrCanvas.getContext('2d');

const camIndicator = document.getElementById('cam-dot');
const audioIndicator = document.getElementById('audio-dot');
const leftStatus = document.getElementById('left-hand-status');
const rightStatus = document.getElementById('right-hand-status');
const freqReadout = document.getElementById('freq-readout');
const sustainBadge = document.getElementById('sustain-badge');
const muteBadge = document.getElementById('mute-badge');
const guidelinesOverlay = document.getElementById('gesture-guidelines');
const audioUnlockBtn = document.getElementById('audio-unlock');
const waveformDisplay = document.getElementById('waveform-display');

// Loop/Chain UI elements (added dynamically)
let loopBadge = null;
let chainDisplay = null;

// Audio Context and Nodes
let audioCtx = null;
let chordOscillators = [];  // Array of {osc, gain} for each chord frequency
let filterNode = null;
let delayNode = null;
let delayFeedbackNode = null;
let delayWetNode = null;
let mainGainNode = null;
let analyserNode = null;
let isAudioEngineStarted = false;

// Synthesizer State
const synthState = {
  currentChordIndex: -1,  // Which chord preset is active (-1 = none)
  currentChordName: "",
  octave: 4,
  detune: 0,
  cutoff: 20000,
  q: 1.0,
  envelope: {
    attack: 0.1,
    decay: 0.3,
    sustain: 0.7,
    release: 0.5
  },
  delay: {
    time: 0.3,
    feedback: 0.3
  },
  pitchBend: 1.0,
  isPlaying: false,
  isSustained: false
};

// Chord Chain & Loop State (G save / L loop)
const loopState = {
  savedChords: [],       // Array of {name, freqs} saved by G
  looping: false,        // Is loop playing?
  loopIndex: 0,          // Current chord in loop
  loopTimer: null,       // setInterval ID for loop
  lastSavedChordIndex: -1  // Track what was last played before G
};

// Hand tracking
let webcamRunning = false;
let lastVideoTime = -1;

// Gesture debouncing (prevent rapid-fire G/L triggers)
let lastGTriggerTime = 0;
let lastLTriggerTime = 0;
const GESTURE_DEBOUNCE_MS = 600;

// Track previous hand states for edge detection
let prevRightFist = false;
let prevLeftOpen = false;

// ============================================================
// 1. Audio System
// ============================================================
function initAudio() {
  if (isAudioEngineStarted) return;
  
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Lowpass Filter
    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(synthState.cutoff, audioCtx.currentTime);
    filterNode.Q.setValueAtTime(synthState.q, audioCtx.currentTime);
    
    // Delay
    delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.setValueAtTime(synthState.delay.time, audioCtx.currentTime);
    delayFeedbackNode = audioCtx.createGain();
    delayFeedbackNode.gain.setValueAtTime(synthState.delay.feedback, audioCtx.currentTime);
    delayWetNode = audioCtx.createGain();
    delayWetNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
    
    // Main Gain
    mainGainNode = audioCtx.createGain();
    mainGainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    
    // Analyser
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 1024;
    
    // Routing
    filterNode.connect(mainGainNode);
    filterNode.connect(delayNode);
    delayNode.connect(delayFeedbackNode);
    delayFeedbackNode.connect(delayNode);
    delayNode.connect(delayWetNode);
    delayWetNode.connect(mainGainNode);
    mainGainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    
    isAudioEngineStarted = true;
    audioIndicator.classList.add('active');
    audioUnlockBtn.style.display = 'none';
    console.log("Audio engine initialized.");
  } catch (error) {
    console.error("Audio init failed:", error);
  }
}

// Play a chord (array of frequencies) using multiple oscillators
function playChord(freqs, pitchBend = 1.0) {
  if (!audioCtx) return;
  stopChord();
  
  const now = audioCtx.currentTime;
  
  freqs.forEach(f => {
    const bendedFreq = f * pitchBend;
    
    // Sawtooth oscillator (0.7 mix)
    const sawOsc = audioCtx.createOscillator();
    sawOsc.type = 'sawtooth';
    sawOsc.frequency.setValueAtTime(bendedFreq, now);
    const sawGain = audioCtx.createGain();
    sawGain.gain.setValueAtTime(0.7 / freqs.length, now);
    sawOsc.connect(sawGain);
    sawGain.connect(filterNode);
    sawOsc.start(now);
    
    // Square oscillator (0.3 mix)
    const sqOsc = audioCtx.createOscillator();
    sqOsc.type = 'square';
    sqOsc.frequency.setValueAtTime(bendedFreq, now);
    const sqGain = audioCtx.createGain();
    sqGain.gain.setValueAtTime(0.3 / freqs.length, now);
    sqOsc.connect(sqGain);
    sqGain.connect(filterNode);
    sqOsc.start(now);
    
    chordOscillators.push(
      { osc: sawOsc, gain: sawGain },
      { osc: sqOsc, gain: sqGain }
    );
  });
  
  // ADSR Attack
  mainGainNode.gain.cancelScheduledValues(now);
  mainGainNode.gain.setValueAtTime(0, now);
  mainGainNode.gain.linearRampToValueAtTime(0.4, now + synthState.envelope.attack);
  mainGainNode.gain.setTargetAtTime(
    synthState.envelope.sustain * 0.4,
    now + synthState.envelope.attack,
    synthState.envelope.decay
  );
  
  synthState.isPlaying = true;
}

// Update pitch bend on existing oscillators
function updateChordPitchBend(freqs, pitchBend) {
  if (!audioCtx || chordOscillators.length === 0) return;
  const now = audioCtx.currentTime;
  
  // Each freq has 2 oscillators (saw + square)
  for (let i = 0; i < freqs.length; i++) {
    const bendedFreq = freqs[i] * pitchBend;
    const sawIdx = i * 2;
    const sqIdx = i * 2 + 1;
    if (chordOscillators[sawIdx]) {
      chordOscillators[sawIdx].osc.frequency.setTargetAtTime(bendedFreq, now, 0.05);
    }
    if (chordOscillators[sqIdx]) {
      chordOscillators[sqIdx].osc.frequency.setTargetAtTime(bendedFreq, now, 0.05);
    }
  }
}

// Stop all chord oscillators
function stopChord() {
  chordOscillators.forEach(({ osc }) => {
    try { osc.stop(); } catch(e) {}
  });
  chordOscillators = [];
}

// Release with ADSR envelope
function triggerRelease() {
  if (!audioCtx || !synthState.isPlaying) return;
  
  const now = audioCtx.currentTime;
  synthState.isPlaying = false;
  synthState.isSustained = false;
  
  mainGainNode.gain.cancelScheduledValues(now);
  mainGainNode.gain.setValueAtTime(mainGainNode.gain.value, now);
  mainGainNode.gain.setTargetAtTime(0, now, synthState.envelope.release / 4);
  
  const cleanupMs = synthState.envelope.release * 1000 + 100;
  setTimeout(() => {
    if (!synthState.isPlaying) {
      stopChord();
    }
  }, cleanupMs);
}

// ============================================================
// 2. Chord Chain & Loop System (G save / L loop)
// ============================================================
function saveChordToChain(chordIndex) {
  if (chordIndex < 0 || chordIndex >= CHORD_PRESETS.length) return;
  
  const chord = CHORD_PRESETS[chordIndex];
  loopState.savedChords.push({
    name: chord.name,
    freqs: [...chord.freqs]
  });
  
  console.log(`[G SAVED #${loopState.savedChords.length}] ${chord.name}`);
  updateChainDisplay();
}

function toggleLoop() {
  if (loopState.looping) {
    // Stop loop
    stopLoop();
    console.log("[L STOP] Loop stopped.");
  } else if (loopState.savedChords.length > 0) {
    // Start loop
    startLoop();
    console.log("[L LOOP] Playing saved chords...");
  } else {
    console.log("[L] No chords saved yet.");
  }
  updateLoopBadge();
}

function startLoop() {
  loopState.looping = true;
  loopState.loopIndex = 0;
  
  // Play first chord immediately
  playLoopChord();
  
  // Cycle every 1 second
  loopState.loopTimer = setInterval(() => {
    loopState.loopIndex = (loopState.loopIndex + 1) % loopState.savedChords.length;
    playLoopChord();
  }, 1000);
}

function playLoopChord() {
  const chord = loopState.savedChords[loopState.loopIndex];
  if (!chord) return;
  
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  playChord(chord.freqs, synthState.pitchBend);
  synthState.currentChordName = chord.name;
  
  freqReadout.innerText = `LOOP: ${chord.name}`;
  updateChainDisplay();
}

function stopLoop() {
  loopState.looping = false;
  if (loopState.loopTimer) {
    clearInterval(loopState.loopTimer);
    loopState.loopTimer = null;
  }
  triggerRelease();
}

function clearChain() {
  stopLoop();
  loopState.savedChords = [];
  loopState.loopIndex = 0;
  updateChainDisplay();
  updateLoopBadge();
  console.log("[CLEAR] Chain cleared.");
}

// ============================================================
// 3. UI Updates
// ============================================================
function updateFilterCutoff(val) {
  synthState.cutoff = val;
  document.getElementById('val-cutoff').innerText = `${Math.round(val)} Hz`;
  if (filterNode) {
    filterNode.frequency.setTargetAtTime(val, audioCtx.currentTime, 0.05);
  }
}

function updateChainDisplay() {
  if (!chainDisplay) return;
  if (loopState.savedChords.length === 0) {
    chainDisplay.innerText = "No chords saved";
    return;
  }
  const names = loopState.savedChords.map((c, i) => {
    if (loopState.looping && i === loopState.loopIndex) {
      return `[${c.name}]`;  // Highlight current
    }
    return c.name;
  });
  chainDisplay.innerText = names.join(" → ");
}

function updateLoopBadge() {
  if (!loopBadge) return;
  if (loopState.looping) {
    loopBadge.style.display = 'inline-block';
    loopBadge.innerText = 'LOOP PLAYING';
  } else {
    loopBadge.style.display = 'none';
  }
}

function updateChordButtons(activeIndex) {
  document.querySelectorAll('.wave-btn').forEach((btn, i) => {
    if (i === activeIndex) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function drawADSR() {
  const w = adsrCanvas.width = adsrCanvas.clientWidth;
  const h = adsrCanvas.height = adsrCanvas.clientHeight;
  adsrCtx.clearRect(0, 0, w, h);
  
  adsrCtx.fillStyle = '#06070a';
  adsrCtx.fillRect(0, 0, w, h);
  
  adsrCtx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
  adsrCtx.lineWidth = 1;
  for (let x = 0; x < w; x += 20) {
    adsrCtx.beginPath(); adsrCtx.moveTo(x, 0); adsrCtx.lineTo(x, h); adsrCtx.stroke();
  }
  for (let y = 0; y < h; y += 20) {
    adsrCtx.beginPath(); adsrCtx.moveTo(0, y); adsrCtx.lineTo(w, y); adsrCtx.stroke();
  }
  
  const attackW = (synthState.envelope.attack / 2.0) * (w * 0.22);
  const decayW = (synthState.envelope.decay / 2.0) * (w * 0.22);
  const sustainH = h - (synthState.envelope.sustain * (h * 0.7) + (h * 0.1));
  const sustainW = w * 0.26;
  const releaseW = (synthState.envelope.release / 4.0) * (w * 0.26);
  
  const padLeft = 12;
  const p0 = { x: padLeft, y: h - 12 };
  const p1 = { x: p0.x + attackW, y: 15 };
  const p2 = { x: p1.x + decayW, y: sustainH };
  const p3 = { x: p2.x + sustainW, y: sustainH };
  const p4 = { x: p3.x + releaseW, y: h - 12 };
  
  adsrCtx.beginPath();
  adsrCtx.moveTo(p0.x, p0.y); adsrCtx.lineTo(p1.x, p1.y); adsrCtx.lineTo(p2.x, p2.y);
  adsrCtx.lineTo(p3.x, p3.y); adsrCtx.lineTo(p4.x, p4.y);
  adsrCtx.lineTo(p4.x, h); adsrCtx.lineTo(p0.x, h); adsrCtx.closePath();
  
  const grad = adsrCtx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255, 0, 91, 0.35)');
  grad.addColorStop(1, 'rgba(255, 0, 91, 0.0)');
  adsrCtx.fillStyle = grad;
  adsrCtx.fill();
  
  adsrCtx.beginPath();
  adsrCtx.moveTo(p0.x, p0.y); adsrCtx.lineTo(p1.x, p1.y); adsrCtx.lineTo(p2.x, p2.y);
  adsrCtx.lineTo(p3.x, p3.y); adsrCtx.lineTo(p4.x, p4.y);
  adsrCtx.strokeStyle = '#ff005b';
  adsrCtx.lineWidth = 2.5;
  adsrCtx.shadowBlur = 8;
  adsrCtx.shadowColor = '#ff005b';
  adsrCtx.stroke();
  adsrCtx.shadowBlur = 0;
  
  [p1, p2, p3].forEach(p => {
    adsrCtx.beginPath();
    adsrCtx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    adsrCtx.fillStyle = '#00f3ff';
    adsrCtx.fill();
    adsrCtx.strokeStyle = '#fff';
    adsrCtx.lineWidth = 1;
    adsrCtx.stroke();
  });
}

// ============================================================
// 4. Dashboard Listeners
// ============================================================
function setupDashboardListeners() {
  // Chord selector buttons (replaced waveform buttons)
  document.querySelectorAll('.wave-btn').forEach((btn, index) => {
    btn.addEventListener('click', () => {
      if (index < CHORD_PRESETS.length) {
        const chord = CHORD_PRESETS[index];
        initAudio();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        playChord(chord.freqs);
        synthState.currentChordIndex = index;
        synthState.currentChordName = chord.name;
        waveformDisplay.innerText = chord.name;
        updateChordButtons(index);
        freqReadout.innerText = chord.name;
      }
    });
  });

  // Octave / Detune
  document.getElementById('knob-octave').addEventListener('input', (e) => {
    synthState.octave = parseInt(e.target.value);
    document.getElementById('val-octave').innerText = synthState.octave;
  });
  document.getElementById('knob-detune').addEventListener('input', (e) => {
    synthState.detune = parseInt(e.target.value);
    document.getElementById('val-detune').innerText = `${synthState.detune} cents`;
  });

  // Filter
  document.getElementById('slider-cutoff').addEventListener('input', (e) => {
    updateFilterCutoff(parseFloat(e.target.value));
  });
  document.getElementById('slider-q').addEventListener('input', (e) => {
    synthState.q = parseFloat(e.target.value);
    document.getElementById('val-q').innerText = synthState.q.toFixed(1);
    if (filterNode) filterNode.Q.setTargetAtTime(synthState.q, audioCtx.currentTime, 0.05);
  });

  // ADSR
  document.getElementById('fader-attack').addEventListener('input', (e) => {
    synthState.envelope.attack = parseFloat(e.target.value);
    document.getElementById('val-attack').innerText = `${synthState.envelope.attack.toFixed(2)}s`;
    drawADSR();
  });
  document.getElementById('fader-decay').addEventListener('input', (e) => {
    synthState.envelope.decay = parseFloat(e.target.value);
    document.getElementById('val-decay').innerText = `${synthState.envelope.decay.toFixed(2)}s`;
    drawADSR();
  });
  document.getElementById('fader-sustain').addEventListener('input', (e) => {
    synthState.envelope.sustain = parseFloat(e.target.value);
    document.getElementById('val-sustain').innerText = synthState.envelope.sustain.toFixed(2);
    drawADSR();
  });
  document.getElementById('fader-release').addEventListener('input', (e) => {
    synthState.envelope.release = parseFloat(e.target.value);
    document.getElementById('val-release').innerText = `${synthState.envelope.release.toFixed(2)}s`;
    drawADSR();
  });

  // Delay
  document.getElementById('slider-delay-feedback').addEventListener('input', (e) => {
    synthState.delay.feedback = parseFloat(e.target.value) / 100;
    document.getElementById('val-delay-feedback').innerText = `${e.target.value}%`;
    if (delayFeedbackNode) delayFeedbackNode.gain.setValueAtTime(synthState.delay.feedback, audioCtx.currentTime);
  });
  document.getElementById('slider-delay-time').addEventListener('input', (e) => {
    synthState.delay.time = parseFloat(e.target.value);
    document.getElementById('val-delay-time').innerText = `${synthState.delay.time.toFixed(2)}s`;
    if (delayNode) delayNode.delayTime.setValueAtTime(synthState.delay.time, audioCtx.currentTime);
  });
}

// ============================================================
// 5. MediaPipe Hand Tracking
// ============================================================
async function initHandLandmarker() {
  try {
    guidelinesOverlay.querySelector('h2').innerText = "Loading AI Vision Models...";
    
    filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
    );
    
    handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numHands: 2
    });
    
    console.log("MediaPipe HandLandmarker ready.");
    startWebcam();
  } catch (error) {
    console.error("Hand Tracker init failed:", error);
    guidelinesOverlay.innerHTML = `
      <p style="color:#ef4444; font-weight:bold;">MediaPipe Models Failed to Load.<br>
      Error: ${error.message}</p>
    `;
  }
}

function startWebcam() {
  navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" }
  })
  .then((stream) => {
    videoElement.srcObject = stream;
    videoElement.addEventListener('loadeddata', () => {
      webcamRunning = true;
      camIndicator.classList.add('active');
      guidelinesOverlay.classList.add('fade-out');
      requestAnimationFrame(predictLoop);
    });
  })
  .catch((err) => {
    console.error("Webcam failed:", err);
    guidelinesOverlay.innerHTML = `
      <p style="color:#ef4444; font-weight:bold;">Webcam Access Blocked.<br>
      Please allow camera permissions and reload.</p>
    `;
  });
}

async function predictLoop() {
  if (!webcamRunning) return;
  
  canvasElement.width = videoElement.clientWidth;
  canvasElement.height = videoElement.clientHeight;
  
  if (videoElement.currentTime !== lastVideoTime) {
    lastVideoTime = videoElement.currentTime;
    
    if (handLandmarker) {
      const results = handLandmarker.detectForVideo(videoElement, performance.now());
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      evaluateGestures(results);
    }
  }
  
  requestAnimationFrame(predictLoop);
}

// ============================================================
// 6. Gesture Evaluation - The Core Mapping
// ============================================================
function countExtendedFingers(landmarks) {
  let count = 0;
  if (landmarks[8].y < landmarks[6].y) count++;   // Index
  if (landmarks[12].y < landmarks[10].y) count++; // Middle
  if (landmarks[16].y < landmarks[14].y) count++; // Ring
  if (landmarks[20].y < landmarks[18].y) count++; // Pinky
  
  // Thumb
  const thumbTip = landmarks[4];
  const thumbIP = landmarks[3];
  const indexMCP = landmarks[5];
  const distTip = Math.hypot(thumbTip.x - indexMCP.x, thumbTip.y - indexMCP.y);
  const distIP = Math.hypot(thumbIP.x - indexMCP.x, thumbIP.y - indexMCP.y);
  if (distTip > distIP * 1.1) count++;
  
  return count;
}

function evaluateFist(landmarks) {
  const indexCurled = landmarks[8].y > landmarks[5].y;
  const middleCurled = landmarks[12].y > landmarks[9].y;
  const ringCurled = landmarks[16].y > landmarks[13].y;
  const pinkyCurled = landmarks[20].y > landmarks[17].y;
  return indexCurled && middleCurled && ringCurled && pinkyCurled;
}

function evaluateGestures(results) {
  let leftHandLandmarks = null;
  let rightHandLandmarks = null;
  
  if (results.landmarks && results.landmarks.length > 0) {
    results.landmarks.forEach((landmarks, index) => {
      const handedness = results.handednesses[index][0].categoryName;
      if (handedness === 'Left') {
        leftHandLandmarks = landmarks;
      } else {
        rightHandLandmarks = landmarks;
      }
    });
  }
  
  const now = Date.now();
  
  // ─── RIGHT HAND: Chord Selection (fingers) + L Loop (open palm) ───
  if (rightHandLandmarks) {
    drawHandSkeleton(rightHandLandmarks, '#ff005b');
    const fingers = countExtendedFingers(rightHandLandmarks);
    const isFist = evaluateFist(rightHandLandmarks);
    
    if (fingers >= 1 && fingers <= 5) {
      const chordIndex = fingers - 1;
      const chord = CHORD_PRESETS[chordIndex];
      
      loopState.lastSavedChordIndex = chordIndex;
      
      if (!loopState.looping) {
        initAudio();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        if (synthState.currentChordIndex !== chordIndex) {
          playChord(chord.freqs, synthState.pitchBend);
          synthState.currentChordIndex = chordIndex;
          synthState.currentChordName = chord.name;
          waveformDisplay.innerText = chord.name;
          updateChordButtons(chordIndex);
        }
        
        freqReadout.innerText = chord.name;
      }
      
      rightStatus.innerText = `${fingers} FINGERS (${chord.name})`;
      rightStatus.className = "stat-value wave-active";
      muteBadge.style.display = 'none';
    } else if (!isFist) {
      // RIGHT OPEN PALM = L (Toggle Loop)
      if (!prevRightFist && (now - lastLTriggerTime > GESTURE_DEBOUNCE_MS)) {
        lastLTriggerTime = now;
        toggleLoop();
      }
      prevRightFist = true;
      
      if (loopState.looping) {
        rightStatus.innerText = "OPEN PALM (LOOP ON)";
        muteBadge.style.display = 'inline-block';
        muteBadge.innerText = 'LOOPING';
      } else {
        rightStatus.innerText = "OPEN PALM (L TOGGLE)";
        muteBadge.style.display = 'none';
      }
      rightStatus.className = "stat-value";
    } else {
      prevRightFist = false;
      rightStatus.innerText = "FIST (IDLE)";
      rightStatus.className = "stat-value";
      muteBadge.style.display = 'none';
    }
  } else {
    prevRightFist = false;
    rightStatus.innerText = "OUT OF FRAME";
    rightStatus.className = "stat-value";
    
    if (!loopState.looping && synthState.isPlaying && !synthState.isSustained) {
      synthState.isSustained = true;
      sustainBadge.style.display = 'inline-block';
      freqReadout.innerText = `${synthState.currentChordName} (HOLD)`;
    }
  }
  
  // ─── LEFT HAND: G Save (Fist) + Pitch/Filter Modulation (Fist) ───
  if (leftHandLandmarks) {
    const isFist = evaluateFist(leftHandLandmarks);
    
    if (isFist) {
      drawHandSkeleton(leftHandLandmarks, '#00f3ff');
      
      // LEFT FIST = G (Save/stamp) on rising edge
      if (!prevLeftOpen && (now - lastGTriggerTime > GESTURE_DEBOUNCE_MS)) {
        lastGTriggerTime = now;
        if (loopState.lastSavedChordIndex >= 0) {
          saveChordToChain(loopState.lastSavedChordIndex);
          muteBadge.style.display = 'inline-block';
          muteBadge.innerText = 'G STAMP';
          setTimeout(() => { muteBadge.style.display = 'none'; }, 500);
        }
      }
      prevLeftOpen = true;
      
      // Fist position = modulation
      const anchorNode = leftHandLandmarks[9];
      const fistX = anchorNode.x;
      const fistY = anchorNode.y;
      
      const pixelX = fistX * canvasElement.width;
      const pixelY = fistY * canvasElement.height;
      canvasCtx.beginPath();
      canvasCtx.arc(pixelX, pixelY, 22, 0, Math.PI * 2);
      canvasCtx.strokeStyle = '#00f3ff';
      canvasCtx.lineWidth = 2.5;
      canvasCtx.stroke();
      canvasCtx.beginPath();
      canvasCtx.arc(pixelX, pixelY, 4, 0, Math.PI * 2);
      canvasCtx.fillStyle = '#ff005b';
      canvasCtx.fill();
      
      // X = Pitch Bend, Y = Filter Cutoff
      synthState.pitchBend = 0.9 + (fistX * 0.2);
      const targetCutoff = 100 * Math.pow(16000 / 100, 1 - fistY);
      updateFilterCutoff(targetCutoff);
      document.getElementById('slider-cutoff').value = targetCutoff;
      
      if (synthState.isPlaying && synthState.currentChordIndex >= 0) {
        const freqs = CHORD_PRESETS[synthState.currentChordIndex].freqs;
        updateChordPitchBend(freqs, synthState.pitchBend);
      }
      
      leftStatus.innerText = `FIST (G SAVE + Mod)`;
      leftStatus.className = "stat-value active";
    } else {
      prevLeftOpen = false;
      drawHandSkeleton(leftHandLandmarks, 'rgba(139, 155, 180, 0.4)');
      leftStatus.innerText = "OPEN PALM (IDLE)";
      leftStatus.className = "stat-value";
    }
  } else {
    prevLeftOpen = false;
    leftStatus.innerText = "OUT OF FRAME";
    leftStatus.className = "stat-value";
  }
}

// ============================================================
// 7. Hand Skeleton Renderer
// ============================================================
function drawHandSkeleton(landmarks, color) {
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = 2.5;
  canvasCtx.fillStyle = color;
  
  landmarks.forEach(pt => {
    const x = pt.x * canvasElement.width;
    const y = pt.y * canvasElement.height;
    canvasCtx.beginPath();
    canvasCtx.arc(x, y, 3, 0, Math.PI * 2);
    canvasCtx.fill();
  });
  
  const connect = (a, b) => {
    canvasCtx.beginPath();
    canvasCtx.moveTo(landmarks[a].x * canvasElement.width, landmarks[a].y * canvasElement.height);
    canvasCtx.lineTo(landmarks[b].x * canvasElement.width, landmarks[b].y * canvasElement.height);
    canvasCtx.stroke();
  };
  
  connect(0, 1); connect(1, 2); connect(2, 3); connect(3, 4);
  connect(0, 5); connect(5, 6); connect(6, 7); connect(7, 8);
  connect(5, 9); connect(9, 10); connect(10, 11); connect(11, 12);
  connect(9, 13); connect(13, 14); connect(14, 15); connect(15, 16);
  connect(13, 17); connect(0, 17); connect(17, 18); connect(18, 19); connect(19, 20);
}

// ============================================================
// 8. Oscilloscope Visualizer
// ============================================================
function renderOscilloscope() {
  requestAnimationFrame(renderOscilloscope);
  
  const w = visualizerCanvas.width = visualizerCanvas.clientWidth;
  const h = visualizerCanvas.height = visualizerCanvas.clientHeight;
  visualizerCtx.clearRect(0, 0, w, h);
  
  visualizerCtx.fillStyle = '#020305';
  visualizerCtx.fillRect(0, 0, w, h);
  
  visualizerCtx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
  visualizerCtx.lineWidth = 1;
  for (let x = 0; x < w; x += 30) {
    visualizerCtx.beginPath(); visualizerCtx.moveTo(x, 0); visualizerCtx.lineTo(x, h); visualizerCtx.stroke();
  }
  for (let y = 0; y < h; y += 30) {
    visualizerCtx.beginPath(); visualizerCtx.moveTo(0, y); visualizerCtx.lineTo(w, y); visualizerCtx.stroke();
  }
  
  if (analyserNode && synthState.isPlaying) {
    const binCount = analyserNode.frequencyBinCount;
    const timeDomainArray = new Uint8Array(binCount);
    analyserNode.getByteTimeDomainData(timeDomainArray);
    
    visualizerCtx.lineWidth = 2.5;
    
    // Color based on active chord
    const activeColor = synthState.currentChordIndex >= 0
      ? CHORD_PRESETS[synthState.currentChordIndex].color
      : '#00f3ff';
    
    visualizerCtx.strokeStyle = activeColor;
    visualizerCtx.shadowBlur = 6;
    visualizerCtx.shadowColor = activeColor;
    
    visualizerCtx.beginPath();
    const sliceWidth = w / binCount;
    let x = 0;
    
    for (let i = 0; i < binCount; i++) {
      const val = timeDomainArray[i] / 128.0;
      const y = val * (h / 2);
      if (i === 0) visualizerCtx.moveTo(x, y);
      else visualizerCtx.lineTo(x, y);
      x += sliceWidth;
    }
    
    visualizerCtx.lineTo(w, h / 2);
    visualizerCtx.stroke();
    visualizerCtx.shadowBlur = 0;
  } else {
    visualizerCtx.strokeStyle = 'rgba(0, 243, 255, 0.15)';
    visualizerCtx.lineWidth = 1.5;
    visualizerCtx.beginPath();
    visualizerCtx.moveTo(0, h / 2);
    visualizerCtx.lineTo(w, h / 2);
    visualizerCtx.stroke();
  }
}

// ============================================================
// 9. Application Init
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  setupDashboardListeners();
  drawADSR();
  renderOscilloscope();
  
  // Create loop/chain UI elements
  loopBadge = document.createElement('div');
  loopBadge.className = 'badge';
  loopBadge.style.display = 'none';
  loopBadge.innerText = 'LOOP PLAYING';
  document.querySelector('.status-badge-container').appendChild(loopBadge);
  
  // Chain display below stats
  chainDisplay = document.createElement('div');
  chainDisplay.id = 'chain-display';
  chainDisplay.style.cssText = 'padding: 8px 12px; background: rgba(0,243,255,0.05); border: 1px solid rgba(0,243,255,0.15); border-radius: 6px; color: #8b9bb4; font-size: 0.75rem; font-family: monospace; margin-top: 8px; min-height: 24px;';
  chainDisplay.innerText = 'No chords saved';
  const statsGrid = document.querySelector('.stats-grid');
  if (statsGrid) statsGrid.parentElement.appendChild(chainDisplay);
  
  audioUnlockBtn.addEventListener('click', initAudio);
  document.body.addEventListener('click', () => {
    if (!isAudioEngineStarted) initAudio();
  }, { once: true });
  
  initHandLandmarker();
});
