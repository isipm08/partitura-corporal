const camera = document.querySelector("#camera");
const handCanvas = document.querySelector("#mediapipeCanvas");
const handContext = handCanvas.getContext("2d");
const musicCanvas = document.querySelector("#opencvCanvas");
const musicContext = musicCanvas.getContext("2d");
const startButton = document.querySelector("#startButton");
const soundButton = document.querySelector("#soundButton");
const songButtons = document.querySelectorAll(".song-button");
const statusText = document.querySelector("#status");
const positionValue = document.querySelector("#toneValue");
const speedValue = document.querySelector("#volumeValue");
const laneValue = document.querySelector("#handValue");
const visibleValue = document.querySelector("#particleValue");
const movementValue = document.querySelector("#movementValue");
const syncValue = document.querySelector("#syncValue");
const trackValue = document.querySelector("#trackValue");
const opencvPlaceholder = document.querySelector("#opencvPlaceholder");

const PROCESS_WIDTH = 160;
const PROCESS_HEIGHT = 90;
const LOGICAL_WIDTH = 160;
const LOGICAL_HEIGHT = 90;
const ACTIVATION_Y = 80;
const TRAVEL_TIME = 1.8;
const MIN_LANE_HOLD = 0.75;
const HIT_TOLERANCE = 0.28;
const SMOOTHING = 0.34;
const HYSTERESIS = 4;
const LANE_HUES = [278, 132, 211, 28];
const LANE_NAMES = ["Morado", "Verde", "Azul", "Naranja"];

const SONGS = {
  "do-for-love": {
    title: "Do For Love",
    audioPath: "./assets/music/do-for-love-instrumental.mp3",
    mapPath: "./songs/do-for-love/notes.json",
    level: 2.0,
    idleVolume: 0.055,
    activeMin: 0.48,
    activeMax: 0.82,
    movementThreshold: 0.025,
  },
  "never-say-never": {
    title: "Never Say Never",
    audioPath: "./assets/music/never-say-never-instrumental.mp3",
    mapPath: "./songs/never-say-never/notes.json",
    level: 1.0,
    idleVolume: 0.025,
    activeMin: 0.24,
    activeMax: 0.56,
    movementThreshold: 0.045,
  },
  "beat-it": {
    title: "Beat It",
    audioPath: "./assets/music/normal-beat-it.mp3",
    mapPath: "./songs/beat-it/notes.json",
    level: 1.0,
    idleVolume: 0.025,
    activeMin: 0.24,
    activeMax: 0.56,
    movementThreshold: 0.055,
  },
  "back-in-black": {
    title: "Back in Black",
    audioPath: "./assets/music/extreme-back-in-black.mp3",
    mapPath: "./songs/back-in-black/notes.json",
    level: 1.0,
    idleVolume: 0.022,
    activeMin: 0.22,
    activeMax: 0.52,
    movementThreshold: 0.085,
  },
};

for (const song of Object.values(SONGS)) {
  song.audio = new Audio(song.audioPath);
  song.audio.preload = "auto";
  song.audio.loop = true;
  // La pista completa queda apenas audible: funciona como guía temporal.
  song.audio.volume = song.idleVolume;
}

let selectedSongId = "beat-it";
let notes = [];
let running = false;
let soundEnabled = true;
let cameraStream = null;
let handLandmarker = null;
let lastVideoTime = -1;
let lastHandInference = 0;
let lastHandSeen = 0;
let lastSecondarySeen = 0;
let primaryCandidateFrames = 0;
let secondaryCandidateFrames = 0;
let smoothedPalm = null;
let previousPalm = null;
let currentPalm = null;
let currentLandmarks = null;
let secondaryPalm = null;
let secondaryLandmarks = null;
let secondaryLane = null;
let currentLane = null;
let palmSpeed = 0;
let cvApi = null;
let capture = null;
let sourceFrame = null;
let grayFrame = null;
let previousGrayFrame = null;
let differenceFrame = null;
let motionMask = null;
let previousFrameReady = false;
let lastMotionAnalysis = 0;
let motionStrength = 0;
const particles = [];
let lastSustainTrigger = 0;

function setStatus(message, error = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", error);
}

function currentSong() {
  return SONGS[selectedSongId];
}

function currentSongTime() {
  return currentSong().audio.currentTime;
}

async function loadMap(songId) {
  const response = await fetch(SONGS[songId].mapPath);
  if (!response.ok) throw new Error(`No se pudo cargar ${SONGS[songId].mapPath}`);
  notes = await response.json();
  notes.sort((a, b) => a.time - b.time);
  const spacedNotes = [];
  let lastAcceptedLane = null;
  let lastLaneChangeTime = -Infinity;
  for (const note of notes) {
    if (note.lane === lastAcceptedLane) continue;
    if (note.time - lastLaneChangeTime < MIN_LANE_HOLD) continue;
    spacedNotes.push(note);
    lastAcceptedLane = note.lane;
    lastLaneChangeTime = note.time;
  }
  notes = spacedNotes;
}

async function selectSong(songId, restart = true) {
  Object.values(SONGS).forEach((song) => song.audio.pause());
  selectedSongId = songId;
  await loadMap(songId);
  const song = currentSong();
  if (restart) song.audio.currentTime = 0;
  trackValue.textContent = song.title;
  songButtons.forEach((button) => button.classList.toggle("active", button.dataset.song === songId));
  if (running && soundEnabled) await song.audio.play();
}

async function createHandDetector() {
  setStatus("Cargando MediaPipe…");
  const { FilesetResolver, HandLandmarker } = await import("./vendor/mediapipe/vision_bundle.mjs");
  const vision = await FilesetResolver.forVisionTasks("./vendor/mediapipe/wasm");
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.36,
    minHandPresenceConfidence: 0.36,
    minTrackingConfidence: 0.25,
  });
}

function resizeDisplay() {
  const width = camera.videoWidth || 640;
  const height = camera.videoHeight || 360;
  if (handCanvas.width === width && handCanvas.height === height) return;
  handCanvas.width = width;
  handCanvas.height = height;
  musicCanvas.width = width;
  musicCanvas.height = height;
}

function calculatePalm(landmarks) {
  const knuckles = [5, 9, 13, 17];
  const center = knuckles.reduce(
    (sum, index) => ({ x: sum.x + landmarks[index].x, y: sum.y + landmarks[index].y }),
    { x: 0, y: 0 },
  );
  const wrist = landmarks[0];
  const raw = {
    x: 1 - (wrist.x * 0.42 + center.x / knuckles.length * 0.58),
    y: wrist.y * 0.42 + center.y / knuckles.length * 0.58,
  };
  if (!smoothedPalm) smoothedPalm = raw;
  else {
    smoothedPalm.x += (raw.x - smoothedPalm.x) * SMOOTHING;
    smoothedPalm.y += (raw.y - smoothedPalm.y) * SMOOTHING;
  }
  return smoothedPalm;
}

function calculateIndependentPalm(landmarks) {
  const knuckles = [5, 9, 13, 17];
  const center = knuckles.reduce(
    (sum, index) => ({ x: sum.x + landmarks[index].x, y: sum.y + landmarks[index].y }),
    { x: 0, y: 0 },
  );
  const wrist = landmarks[0];
  return {
    x: 1 - (wrist.x * 0.42 + center.x / knuckles.length * 0.58),
    y: wrist.y * 0.42 + center.y / knuckles.length * 0.58,
  };
}

function isPlausibleHand(landmarks) {
  if (!landmarks || landmarks.length !== 21) return false;
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const wrist = landmarks[0];
  const middleTip = landmarks[12];
  const wristToFinger = Math.hypot(wrist.x - middleTip.x, wrist.y - middleTip.y);
  return width >= 0.065 && height >= 0.09 && wristToFinger >= 0.1 && width <= 0.9 && height <= 0.95;
}
function stableLane(normalizedX) {
  const x = normalizedX * LOGICAL_WIDTH;
  const candidate = Math.max(0, Math.min(3, Math.floor(x / 40)));
  if (currentLane === null) return candidate;
  if (candidate > currentLane && x > candidate * 40 + HYSTERESIS) return candidate;
  if (candidate < currentLane && x < currentLane * 40 - HYSTERESIS) return candidate;
  return currentLane;
}

function updatePalm(landmarks, now) {
  const palm = calculatePalm(landmarks);
  if (previousPalm) {
    const distance = Math.hypot(palm.x - previousPalm.x, palm.y - previousPalm.y);
    palmSpeed = palmSpeed * 0.55 + Math.min(1, distance / 0.055) * 0.45;
  }
  previousPalm = { x: palm.x, y: palm.y };
  currentPalm = { x: palm.x * LOGICAL_WIDTH, y: palm.y * LOGICAL_HEIGHT, seenAt: now };
  currentLane = stableLane(palm.x);
  currentLandmarks = landmarks;
  positionValue.textContent = `${Math.round(palm.x * 100)}%, ${Math.round(palm.y * 100)}%`;
  speedValue.textContent = `${Math.round(palmSpeed * 100)}%`;
  laneValue.textContent = LANE_NAMES[currentLane];
}

function drawHandView() {
  const width = handCanvas.width;
  const height = handCanvas.height;
  handContext.fillStyle = "#000";
  handContext.fillRect(0, 0, width, height);
  for (let lane = 0; lane < 4; lane += 1) {
    const active = lane === currentLane || lane === secondaryLane;
    handContext.fillStyle = `hsla(${LANE_HUES[lane]},100%,58%,${active ? 0.24 : 0.07})`;
    handContext.fillRect(lane * width / 4, 0, width / 4, height);
    handContext.strokeStyle = `hsla(${LANE_HUES[lane]},100%,72%,.55)`;
    handContext.strokeRect(lane * width / 4 + 1, 1, width / 4 - 2, height - 2);
  }
  if (!currentLandmarks) return;
  const points = currentLandmarks.map((point) => ({ x: (1 - point.x) * width, y: point.y * height }));
  const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  handContext.shadowBlur = 12;
  handContext.shadowColor = `hsla(${LANE_HUES[currentLane]},100%,70%,1)`;
  handContext.strokeStyle = `hsla(${LANE_HUES[currentLane]},100%,82%,1)`;
  handContext.lineWidth = 2;
  for (const [a, b] of connections) {
    handContext.beginPath();
    handContext.moveTo(points[a].x, points[a].y);
    handContext.lineTo(points[b].x, points[b].y);
    handContext.stroke();
  }
  handContext.fillStyle = `hsla(${LANE_HUES[currentLane]},100%,90%,1)`;
  points.forEach((point) => { handContext.beginPath(); handContext.arc(point.x, point.y, 2.6, 0, Math.PI * 2); handContext.fill(); });
  if (currentPalm) {
    handContext.strokeStyle = `hsla(${LANE_HUES[currentLane]},100%,75%,1)`;
    handContext.lineWidth = 4;
    handContext.beginPath();
    handContext.arc(currentPalm.x / LOGICAL_WIDTH * width, currentPalm.y / LOGICAL_HEIGHT * height, 15, 0, Math.PI * 2);
    handContext.stroke();
  }
  if (secondaryLandmarks && secondaryPalm) {
    const secondPoints = secondaryLandmarks.map((point) => ({ x: (1 - point.x) * width, y: point.y * height }));
    handContext.shadowColor = `hsla(${LANE_HUES[secondaryLane]},100%,70%,1)`;
    handContext.strokeStyle = `hsla(${LANE_HUES[secondaryLane]},100%,82%,1)`;
    handContext.lineWidth = 2;
    for (const [a, b] of connections) {
      handContext.beginPath();
      handContext.moveTo(secondPoints[a].x, secondPoints[a].y);
      handContext.lineTo(secondPoints[b].x, secondPoints[b].y);
      handContext.stroke();
    }
    handContext.fillStyle = `hsla(${LANE_HUES[secondaryLane]},100%,90%,1)`;
    secondPoints.forEach((point) => {
      handContext.beginPath();
      handContext.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
      handContext.fill();
    });
    handContext.lineWidth = 4;
    handContext.beginPath();
    handContext.arc(secondaryPalm.x / LOGICAL_WIDTH * width, secondaryPalm.y / LOGICAL_HEIGHT * height, 15, 0, Math.PI * 2);
    handContext.stroke();
  }
  handContext.shadowBlur = 0;
}

function loadOpenCV() {
  return new Promise((resolve, reject) => {
    if (window.cv) { resolve(window.cv); return; }
    const script = document.createElement("script");
    script.src = "./vendor/opencv/opencv.js";
    script.onload = () => resolve(window.cv);
    script.onerror = () => reject(new Error("No se pudo cargar OpenCV.js"));
    document.head.appendChild(script);
  });
}

async function initializeOpenCV() {
  let loaded = await loadOpenCV();
  if (loaded instanceof Promise || typeof loaded?.then === "function") loaded = await loaded;
  if (!loaded?.Mat) await new Promise((resolve) => { loaded.onRuntimeInitialized = resolve; });
  cvApi = loaded;
  camera.width = PROCESS_WIDTH;
  camera.height = PROCESS_HEIGHT;
  capture = new cvApi.VideoCapture(camera);
  sourceFrame = new cvApi.Mat(PROCESS_HEIGHT, PROCESS_WIDTH, cvApi.CV_8UC4);
  grayFrame = new cvApi.Mat(PROCESS_HEIGHT, PROCESS_WIDTH, cvApi.CV_8UC1);
  previousGrayFrame = new cvApi.Mat(PROCESS_HEIGHT, PROCESS_WIDTH, cvApi.CV_8UC1);
  differenceFrame = new cvApi.Mat(PROCESS_HEIGHT, PROCESS_WIDTH, cvApi.CV_8UC1);
  motionMask = new cvApi.Mat(PROCESS_HEIGHT, PROCESS_WIDTH, cvApi.CV_8UC1);
  opencvPlaceholder.hidden = true;
}

function analyzeMotion() {
  capture.read(sourceFrame);
  cvApi.cvtColor(sourceFrame, grayFrame, cvApi.COLOR_RGBA2GRAY);
  cvApi.GaussianBlur(grayFrame, grayFrame, new cvApi.Size(5, 5), 0);
  if (!previousFrameReady) {
    grayFrame.copyTo(previousGrayFrame);
    previousFrameReady = true;
    return;
  }
  cvApi.absdiff(grayFrame, previousGrayFrame, differenceFrame);
  cvApi.threshold(differenceFrame, motionMask, 22, 255, cvApi.THRESH_BINARY);
  let moving = 0;
  let samples = 0;
  for (let y = 4; y < PROCESS_HEIGHT - 4; y += 8) {
    for (let x = 4; x < PROCESS_WIDTH - 4; x += 8) {
      samples += 1;
      if (motionMask.data[y * PROCESS_WIDTH + x] > 0) moving += 1;
    }
  }
  motionStrength = motionStrength * 0.45 + Math.min(1, moving / Math.max(1, samples) * 7) * 0.55;
  movementValue.textContent = `${Math.round(motionStrength * 100)}%`;
  grayFrame.copyTo(previousGrayFrame);
}

function createBurst(lane, now) {
  const x = lane * 40 + 20;
  const amount = Math.min(44, 14 + Math.round(motionStrength * 30));
  for (let index = 0; index < amount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 8 + Math.random() * 24;
    particles.push({ x, y: ACTIVATION_Y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, hue: LANE_HUES[lane], createdAt: now });
  }
  if (particles.length > 120) particles.splice(0, particles.length - 120);
}

function drawMusicView(now) {
  const songTime = currentSongTime();
  const width = musicCanvas.width;
  const height = musicCanvas.height;
  const scaleX = width / LOGICAL_WIDTH;
  const scaleY = height / LOGICAL_HEIGHT;
  musicContext.fillStyle = "#000";
  musicContext.fillRect(0, 0, width, height);
  musicContext.save();
  musicContext.scale(scaleX, scaleY);

  for (let lane = 0; lane < 4; lane += 1) {
    const active = lane === currentLane || lane === secondaryLane;
    musicContext.fillStyle = `hsla(${LANE_HUES[lane]},100%,58%,${active ? 0.16 : 0.045})`;
    musicContext.fillRect(lane * 40, 0, 40, LOGICAL_HEIGHT);
    musicContext.strokeStyle = `hsla(${LANE_HUES[lane]},100%,74%,.55)`;
    musicContext.lineWidth = 0.7;
    musicContext.strokeRect(lane * 40 + 0.5, 0.5, 39, LOGICAL_HEIGHT - 1);
  }

  musicContext.strokeStyle = "rgba(255,255,255,.72)";
  musicContext.lineWidth = 1;
  musicContext.beginPath();
  musicContext.moveTo(0, ACTIVATION_Y);
  musicContext.lineTo(LOGICAL_WIDTH, ACTIVATION_Y);
  musicContext.stroke();

  let activeNote = null;
  let targetSongVolume = currentSong().idleVolume;
  const upcoming = [];
  for (const note of notes) {
    if (note.time <= songTime) activeNote = note;
    else if (note.time <= songTime + TRAVEL_TIME) upcoming.push(note);
    else {
      // Conserva el siguiente cambio en el borde superior para que el camino
      // no desaparezca durante los espacios más largos de la canción.
      if (upcoming.length === 0) upcoming.push(note);
      break;
    }
  }

  const pathAnchor = activeNote || upcoming[0];
  if (pathAnchor) {
    const nextNote = upcoming[0] || null;
    const pathLane = activeNote ? activeNote.lane : pathAnchor.lane;
    const pathX = pathLane * 40 + 20;
    musicContext.lineCap = "round";
    musicContext.lineJoin = "round";
    musicContext.shadowBlur = 16;
    musicContext.shadowColor = `hsla(${LANE_HUES[pathLane]},100%,70%,1)`;
    musicContext.strokeStyle = `hsla(${LANE_HUES[pathLane]},100%,78%,1)`;
    musicContext.lineWidth = 3.8;
    musicContext.beginPath();
    musicContext.moveTo(pathX, ACTIVATION_Y);
    if (activeNote && nextNote) {
      const interval = Math.max(0.001, nextNote.time - activeNote.time);
      const progress = Math.max(0, Math.min(1, (songTime - activeNote.time) / interval));
      const bendY = 11 + progress * (ACTIVATION_Y - 11);
      const nextX = nextNote.lane * 40 + 20;
      musicContext.lineTo(pathX, bendY);
      musicContext.lineTo(nextX, bendY);
      musicContext.lineTo(nextX, 11);
    } else {
      musicContext.lineTo(pathX, 11);
    }
    musicContext.stroke();
    musicContext.shadowBlur = 0;

  }

  if (activeNote) {
    const targetX = activeNote.lane * 40 + 20;
    const handInLane = currentLane === activeNote.lane || secondaryLane === activeNote.lane;
    // MediaPipe decide la activación por posición. OpenCV modula su intensidad,
    // pero una lectura de movimiento baja no bloquea a ninguna de las dos manos.
    const activated = Boolean(currentPalm || secondaryPalm) && handInLane;
    musicContext.fillStyle = `hsla(${LANE_HUES[activeNote.lane]},100%,${activated ? 88 : 68}%,${activated ? 1 : .72})`;
    musicContext.beginPath();
    musicContext.arc(targetX, ACTIVATION_Y, activated ? 7 : 5, 0, Math.PI * 2);
    musicContext.fill();
    const interactionEnergy = Math.max(motionStrength, palmSpeed * 0.65);
    if (activated) {
      const song = currentSong();
      const energy = Math.max(0, Math.min(1, interactionEnergy));
      targetSongVolume = song.activeMin + (song.activeMax - song.activeMin) * energy;
      if (now - lastSustainTrigger > 360) {
        lastSustainTrigger = now;
        createBurst(activeNote.lane, now);
      }
    }
  }

  const songAudio = currentSong().audio;
  songAudio.volume += (targetSongVolume - songAudio.volume) * 0.09;

  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    const age = (now - particle.createdAt) / 1000;
    if (age > 1) { particles.splice(index, 1); continue; }
    musicContext.fillStyle = `hsla(${particle.hue},100%,82%,${1 - age})`;
    musicContext.beginPath();
    musicContext.arc(particle.x + particle.vx * age, particle.y + particle.vy * age, 0.8 + motionStrength, 0, Math.PI * 2);
    musicContext.fill();
  }
  if (currentPalm) {
    musicContext.strokeStyle = `hsla(${LANE_HUES[currentLane]},100%,88%,.98)`;
    musicContext.lineWidth = 1.6;
    musicContext.beginPath();
    musicContext.arc(currentPalm.x, ACTIVATION_Y, 6, 0, Math.PI * 2);
    musicContext.stroke();
  }
  musicContext.restore();
  visibleValue.textContent = String(upcoming.length + (activeNote ? 1 : 0));
}

function handLoop() {
  if (!running) return;
  const now = performance.now();
  drawHandView();
  if (camera.currentTime !== lastVideoTime && now - lastHandInference >= 48) {
    lastVideoTime = camera.currentTime;
    lastHandInference = now;
    const result = handLandmarker.detectForVideo(camera, now);
    const orderedHands = [...(result.landmarks || [])].filter(isPlausibleHand).sort(
      (a, b) => calculateIndependentPalm(a).x - calculateIndependentPalm(b).x,
    );
    const landmarks = orderedHands[0];
    const second = orderedHands[1];
    if (landmarks) {
      primaryCandidateFrames += 1;
      if (primaryCandidateFrames >= 3 || currentLandmarks) {
        lastHandSeen = now;
        updatePalm(landmarks, now);
      }
      if (second) {
        secondaryCandidateFrames += 1;
        if (secondaryCandidateFrames >= 3 || secondaryLandmarks) {
          lastSecondarySeen = now;
          const palm = calculateIndependentPalm(second);
          secondaryPalm = { x: palm.x * LOGICAL_WIDTH, y: palm.y * LOGICAL_HEIGHT, seenAt: now };
          secondaryLane = Math.max(0, Math.min(3, Math.floor(palm.x * 4)));
          secondaryLandmarks = second;
          laneValue.textContent = `${LANE_NAMES[currentLane]} + ${LANE_NAMES[secondaryLane]}`;
        }
      } else {
        secondaryCandidateFrames = 0;
      }
      if (!second && now - lastSecondarySeen > 450) {
        secondaryPalm = null;
        secondaryLane = null;
        secondaryLandmarks = null;
      }
    } else {
      primaryCandidateFrames = 0;
      secondaryCandidateFrames = 0;
    }
    if (!landmarks && now - lastHandSeen > 450) {
      currentPalm = null;
      currentLandmarks = null;
      currentLane = null;
      secondaryPalm = null;
      secondaryLandmarks = null;
      secondaryLane = null;
      smoothedPalm = null;
      previousPalm = null;
      laneValue.textContent = "—";
    }
  }
  requestAnimationFrame(handLoop);
}

function experienceLoop(now) {
  if (!running) return;
  if (now - lastMotionAnalysis >= 180) {
    lastMotionAnalysis = now;
    analyzeMotion();
  }
  drawMusicView(now);
  requestAnimationFrame(experienceLoop);
}

async function startExperience() {
  startButton.disabled = true;
  try {
    setStatus("Solicitando cámara y preparando la experiencia…");
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
      audio: false,
    });
    camera.srcObject = cameraStream;
    await camera.play();
    resizeDisplay();
    await Promise.all([
      handLandmarker ? Promise.resolve() : createHandDetector(),
      cvApi ? Promise.resolve() : initializeOpenCV(),
      loadMap(selectedSongId),
    ]);
    running = true;
    startButton.textContent = "Experiencia activa";
    if (soundEnabled) await currentSong().audio.play();
    setStatus("Mueve la palma a la columna indicada y activa el evento con un gesto.");
    requestAnimationFrame(handLoop);
    requestAnimationFrame(experienceLoop);
  } catch (error) {
    console.error(error);
    setStatus("No se pudo iniciar. Revisa la cámara, el servidor local y la conexión.", true);
    startButton.disabled = false;
  }
}

startButton.addEventListener("click", startExperience);
soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.textContent = `Sonido: ${soundEnabled ? "encendido" : "apagado"}`;
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  if (soundEnabled && running) currentSong().audio.play();
  else Object.values(SONGS).forEach((song) => song.audio.pause());
});
songButtons.forEach((button) => button.addEventListener("click", () => selectSong(button.dataset.song, true)));

// Hace visible la inversión después de cada clic, incluso en clics muy rápidos.
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  const colors = getComputedStyle(button);
  button.style.setProperty("--pressed-background", colors.color);
  button.style.setProperty("--pressed-color", colors.backgroundColor);
  button.classList.remove("button-pressed");
  void button.offsetWidth;
  button.classList.add("button-pressed");
  window.setTimeout(() => button.classList.remove("button-pressed"), 360);
});

loadMap(selectedSongId).catch((error) => setStatus(error.message, true));
window.addEventListener("beforeunload", () => {
  running = false;
  cameraStream?.getTracks().forEach((track) => track.stop());
  Object.values(SONGS).forEach((song) => song.audio.pause());
  handLandmarker?.close();
  [sourceFrame, grayFrame, previousGrayFrame, differenceFrame, motionMask]
    .filter(Boolean)
    .forEach((matrix) => matrix.delete());
});
