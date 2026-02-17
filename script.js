/**
 * CHRONOS — Premium Stopwatch
 * script.js
 *
 * Uses performance.now() for high-resolution, drift-free timing.
 * All state is managed in a single `state` object for clarity.
 */

'use strict';

/* ─────────────────────────────────────────
   STATE
   ───────────────────────────────────────── */
const state = {
  /** Whether the stopwatch is currently counting */
  running: false,
  /** Accumulated time (ms) before the most recent start */
  elapsed: 0,
  /** performance.now() value at the most recent start */
  startStamp: 0,
  /** requestAnimationFrame ID — used to cancel the loop */
  rafId: null,
  /** Array of recorded laps { lapMs, totalMs } */
  laps: [],
  /** Accumulated time at the start of the current lap */
  lapStart: 0,
  /** User preferences */
  soundEnabled: true,
  theme: 'dark',
};

/* ─────────────────────────────────────────
   DOM REFERENCES
   ───────────────────────────────────────── */
const els = {
  hours:          document.getElementById('hours'),
  minutes:        document.getElementById('minutes'),
  seconds:        document.getElementById('seconds'),
  milliseconds:   document.getElementById('milliseconds'),
  timeDisplay:    document.getElementById('timeDisplay'),
  currentLapRow:  document.getElementById('currentLapRow'),
  currentLapTime: document.getElementById('currentLapTime'),
  startPauseBtn:  document.getElementById('startPauseBtn'),
  startPauseIcon: document.getElementById('startPauseIcon'),
  startPauseLabel:document.getElementById('startPauseLabel'),
  lapBtn:         document.getElementById('lapBtn'),
  resetBtn:       document.getElementById('resetBtn'),
  glowRing:       document.getElementById('glowRing'),
  statusDot:      document.getElementById('statusDot'),
  statusText:     document.getElementById('statusText'),
  watchCard:      document.getElementById('watchCard'),
  lapsSection:    document.getElementById('lapsSection'),
  lapsList:       document.getElementById('lapsList'),
  lapsScroll:     document.getElementById('lapsScroll'),
  clearLapsBtn:   document.getElementById('clearLapsBtn'),
  themeToggle:    document.getElementById('themeToggle'),
  soundToggle:    document.getElementById('soundToggle'),
  soundIcon:      document.getElementById('soundIcon'),
};

/* ─────────────────────────────────────────
   AUDIO — tiny tick using Web Audio API
   ───────────────────────────────────────── */
let audioCtx = null;

/**
 * Lazily creates the AudioContext on first use (browser policy).
 * Plays a short, subtle tick sound.
 */
function playTick() {
  if (!state.soundEnabled) return;

  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type      = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.08);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (_) {
    /* Silently fail — sound is optional */
  }
}

/* ─────────────────────────────────────────
   TIME FORMATTING
   ───────────────────────────────────────── */

/**
 * Formats milliseconds into { hh, mm, ss, ms } string parts.
 * @param {number} totalMs
 * @returns {{ hh: string, mm: string, ss: string, ms: string }}
 */
function formatTime(totalMs) {
  const ms      = Math.floor(totalMs)        % 1000;
  const seconds = Math.floor(totalMs / 1000) % 60;
  const minutes = Math.floor(totalMs / 60000) % 60;
  const hours   = Math.floor(totalMs / 3600000);

  return {
    hh: String(hours).padStart(2, '0'),
    mm: String(minutes).padStart(2, '0'),
    ss: String(seconds).padStart(2, '0'),
    ms: String(Math.floor(ms / 10)).padStart(2, '0'), // display centiseconds
  };
}

/**
 * Returns a compact HH:MM:SS.ms string for lap display.
 * @param {number} totalMs
 * @returns {string}
 */
function formatLapTime(totalMs) {
  const { hh, mm, ss, ms } = formatTime(totalMs);
  return `${hh}:${mm}:${ss}.${ms}`;
}

/* ─────────────────────────────────────────
   RENDER — called every animation frame
   ───────────────────────────────────────── */

/**
 * Computes the total elapsed time at a given moment and updates the DOM.
 */
function render() {
  const now     = state.running ? performance.now() : 0;
  const total   = state.running
    ? state.elapsed + (now - state.startStamp)
    : state.elapsed;

  const { hh, mm, ss, ms } = formatTime(total);

  // Only update DOM nodes whose value changed (avoids layout thrashing)
  if (els.hours.textContent       !== hh) els.hours.textContent       = hh;
  if (els.minutes.textContent     !== mm) els.minutes.textContent     = mm;
  if (els.seconds.textContent     !== ss) els.seconds.textContent     = ss;
  if (els.milliseconds.textContent !== ms) els.milliseconds.textContent = ms;

  // Update current lap timer
  if (state.running || state.elapsed > 0) {
    const lapMs  = total - state.lapStart;
    els.currentLapTime.textContent = formatLapTime(lapMs);
  }

  if (state.running) {
    state.rafId = requestAnimationFrame(render);
  }
}

/* ─────────────────────────────────────────
   CONTROLS — Start / Pause / Reset / Lap
   ───────────────────────────────────────── */

/** Starts or resumes the stopwatch. */
function startTimer() {
  if (state.running) return; // Guard: prevent double-start
  state.startStamp = performance.now();
  state.running    = true;

  updateUI('running');
  state.rafId = requestAnimationFrame(render);
}

/** Pauses the stopwatch, preserving elapsed time. */
function pauseTimer() {
  if (!state.running) return;

  // Snapshot elapsed before stopping the loop
  state.elapsed += performance.now() - state.startStamp;
  state.running  = false;

  cancelAnimationFrame(state.rafId);
  state.rafId = null;

  updateUI('paused');
}

/** Resets everything to zero. */
function resetTimer() {
  // Stop any running loop first
  if (state.running) {
    cancelAnimationFrame(state.rafId);
    state.rafId  = null;
    state.running = false;
  }

  state.elapsed    = 0;
  state.startStamp = 0;
  state.lapStart   = 0;
  state.laps       = [];

  // Trigger card animation
  triggerResetAnimation();

  // Update display to 00:00:00.00
  render();
  renderLaps();
  updateUI('idle');

  // Persist cleared laps
  saveLaps();
}

/**
 * Records the current lap time.
 * Calculates both the lap split and the running total.
 */
function recordLap() {
  if (!state.running) return;

  // Total elapsed at this exact moment
  const totalNow = state.elapsed + (performance.now() - state.startStamp);
  const lapMs    = totalNow - state.lapStart;

  state.laps.push({ lapMs, totalMs: totalNow });
  state.lapStart = totalNow; // reset lap start

  playTick();
  renderLaps();
  saveLaps();
}

/* ─────────────────────────────────────────
   UI STATE UPDATES
   ───────────────────────────────────────── */

/**
 * Synchronises all UI elements with the current timer state.
 * @param {'idle'|'running'|'paused'} mode
 */
function updateUI(mode) {
  const isRunning = mode === 'running';
  const isPaused  = mode === 'paused';
  const isIdle    = mode === 'idle';

  // Start/Pause button
  els.startPauseIcon.textContent  = isRunning ? '⏸' : '▶';
  els.startPauseLabel.textContent = isRunning ? 'Pause' : 'Start';
  els.startPauseBtn.setAttribute('aria-label', isRunning ? 'Pause stopwatch' : 'Start stopwatch');

  // Lap button — only active when running
  els.lapBtn.disabled = !isRunning;

  // Glow ring — only visible when running
  els.glowRing.classList.toggle('active', isRunning);

  // Time display pulse
  els.timeDisplay.classList.toggle('running', isRunning);

  // Current lap row visibility
  const showLapRow = isRunning || isPaused;
  els.currentLapRow.classList.toggle('visible', showLapRow);

  // Status badge
  els.statusDot.className = 'status-dot' + (isRunning ? ' running' : isPaused ? ' paused' : '');
  els.statusText.textContent = isRunning ? 'RUNNING' : isPaused ? 'PAUSED' : 'READY';

  // Hide current lap row on full reset
  if (isIdle) {
    els.currentLapRow.classList.remove('visible');
  }
}

/* ─────────────────────────────────────────
   LAP LIST RENDERING
   ───────────────────────────────────────── */

/**
 * Fully re-renders the lap list.
 * Identifies the fastest and slowest laps and highlights them.
 */
function renderLaps() {
  const { laps } = state;

  // Show/hide laps section
  els.lapsSection.hidden = laps.length === 0;

  if (laps.length === 0) {
    els.lapsList.innerHTML = '';
    return;
  }

  // Identify fastest (min) and slowest (max) laps
  const lapTimes   = laps.map(l => l.lapMs);
  const fastestMs  = Math.min(...lapTimes);
  const slowestMs  = Math.max(...lapTimes);
  const isTied     = fastestMs === slowestMs;

  // Build fragment to avoid multiple reflows
  const frag = document.createDocumentFragment();

  laps.forEach((lap, index) => {
    const isFastest = !isTied && lap.lapMs === fastestMs;
    const isSlowest = !isTied && lap.lapMs === slowestMs;

    const li = document.createElement('li');
    li.className = 'lap-item'
      + (isFastest ? ' fastest' : '')
      + (isSlowest ? ' slowest' : '');
    li.setAttribute('role', 'listitem');

    // Lap number
    const numEl    = document.createElement('span');
    numEl.className = 'lap-number';
    numEl.textContent = `#${String(index + 1).padStart(2, '0')}`;

    // Lap split time
    const timeEl    = document.createElement('span');
    timeEl.className = 'lap-time';
    timeEl.textContent = formatLapTime(lap.lapMs);

    // Delta vs average (shown when ≥ 2 laps)
    const deltaEl    = document.createElement('span');
    deltaEl.className = 'lap-delta';
    if (laps.length >= 2) {
      const avg   = lapTimes.reduce((a, b) => a + b, 0) / lapTimes.length;
      const delta = lap.lapMs - avg;
      const sign  = delta >= 0 ? '+' : '';
      deltaEl.textContent = `${sign}${formatLapTime(Math.abs(delta))}`;
      deltaEl.style.color = delta > 0
        ? 'var(--red)'
        : delta < 0
          ? 'var(--green)'
          : 'var(--text-muted)';
    }

    // Badge label
    const badgeEl    = document.createElement('span');
    badgeEl.className = 'lap-badge';
    badgeEl.textContent = isFastest ? 'Fastest' : isSlowest ? 'Slowest' : `Lap ${index + 1}`;

    li.appendChild(numEl);
    li.appendChild(timeEl);
    li.appendChild(deltaEl);
    li.appendChild(badgeEl);
    frag.appendChild(li);
  });

  els.lapsList.innerHTML = '';
  els.lapsList.appendChild(frag);

  // Auto-scroll to the latest lap
  requestAnimationFrame(() => {
    els.lapsScroll.scrollTo({
      top: els.lapsScroll.scrollHeight,
      behavior: 'smooth',
    });
  });
}

/* ─────────────────────────────────────────
   RESET ANIMATION
   ───────────────────────────────────────── */

function triggerResetAnimation() {
  els.watchCard.classList.remove('resetting');
  // Force reflow so the animation re-triggers
  void els.watchCard.offsetWidth;
  els.watchCard.classList.add('resetting');
  els.watchCard.addEventListener('animationend', () => {
    els.watchCard.classList.remove('resetting');
  }, { once: true });
}

/* ─────────────────────────────────────────
   RIPPLE EFFECT
   ───────────────────────────────────────── */

/**
 * Attaches a ripple effect to a button element.
 * @param {HTMLButtonElement} btn
 */
function attachRipple(btn) {
  btn.addEventListener('click', (e) => {
    if (btn.disabled) return;

    const rect = btn.getBoundingClientRect();
    const x    = ((e.clientX - rect.left) / rect.width)  * 100;
    const y    = ((e.clientY - rect.top)  / rect.height) * 100;

    btn.style.setProperty('--ripple-x', `${x}%`);
    btn.style.setProperty('--ripple-y', `${y}%`);

    btn.classList.remove('rippling');
    void btn.offsetWidth; // Force reflow
    btn.classList.add('rippling');

    btn.addEventListener('animationend', () => btn.classList.remove('rippling'), { once: true });
    btn.addEventListener('transitionend', () => btn.classList.remove('rippling'), { once: true });
  });
}

/* ─────────────────────────────────────────
   THEME TOGGLE
   ───────────────────────────────────────── */

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('chronos-theme', state.theme);

  // Swap icon (sun ↔ moon)
  updateThemeIcon();
}

function updateThemeIcon() {
  const isDark  = state.theme === 'dark';
  // Sun icon when in dark (clicking goes to light); Moon icon when in light
  els.soundIcon; // referenced elsewhere
  const themeIcon = document.getElementById('themeIcon');
  if (isDark) {
    // Show sun (switch to light)
    themeIcon.innerHTML = `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
  } else {
    // Show moon (switch to dark)
    themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
  }
}

/* ─────────────────────────────────────────
   SOUND TOGGLE
   ───────────────────────────────────────── */

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem('chronos-sound', state.soundEnabled);
  updateSoundIcon();
}

function updateSoundIcon() {
  const icon = document.getElementById('soundIcon');
  if (state.soundEnabled) {
    icon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>`;
    icon.style.opacity = '1';
  } else {
    icon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>`;
    icon.style.opacity = '0.4';
  }
}

/* ─────────────────────────────────────────
   LOCAL STORAGE — persist laps & preferences
   ───────────────────────────────────────── */

function saveLaps() {
  try {
    localStorage.setItem('chronos-laps', JSON.stringify(state.laps));
  } catch (_) { /* Quota exceeded or private mode — ignore */ }
}

function loadSavedData() {
  // Laps
  try {
    const saved = localStorage.getItem('chronos-laps');
    if (saved) {
      state.laps = JSON.parse(saved);
    }
  } catch (_) { state.laps = []; }

  // Theme
  const savedTheme = localStorage.getItem('chronos-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    state.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', state.theme);
  }

  // Sound
  const savedSound = localStorage.getItem('chronos-sound');
  if (savedSound !== null) {
    state.soundEnabled = savedSound === 'true';
  }
}

/* ─────────────────────────────────────────
   KEYBOARD SHORTCUTS
   ───────────────────────────────────────── */

document.addEventListener('keydown', (e) => {
  // Ignore if focus is on an input element
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      state.running ? pauseTimer() : startTimer();
      break;
    case 'KeyL':
      if (state.running) recordLap();
      break;
    case 'KeyR':
      resetTimer();
      break;
  }
});

/* ─────────────────────────────────────────
   EVENT LISTENERS
   ───────────────────────────────────────── */

els.startPauseBtn.addEventListener('click', () => {
  state.running ? pauseTimer() : startTimer();
});

els.lapBtn.addEventListener('click', () => {
  if (!els.lapBtn.disabled) recordLap();
});

els.resetBtn.addEventListener('click', resetTimer);

els.clearLapsBtn.addEventListener('click', () => {
  state.laps    = [];
  state.lapStart = state.elapsed + (state.running
    ? performance.now() - state.startStamp
    : 0);
  renderLaps();
  saveLaps();
});

els.themeToggle.addEventListener('click', toggleTheme);
els.soundToggle.addEventListener('click', toggleSound);

// Ripple on all buttons
[els.startPauseBtn, els.lapBtn, els.resetBtn].forEach(attachRipple);

/* ─────────────────────────────────────────
   INIT
   ───────────────────────────────────────── */

function init() {
  loadSavedData();
  updateThemeIcon();
  updateSoundIcon();
  renderLaps();
  render(); // Draw zero state immediately
  updateUI('idle');

  // Restore elapsed from saved laps if any (show total of last session)
  // Note: we don't resume timing — just show the preserved lap list
}

init();
