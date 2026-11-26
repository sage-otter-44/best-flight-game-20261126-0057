// Ridge Runner — Alpine Courier: the game loop and wiring.
// Boots the canvas, the world, the input and the sound; stages a screenshot
// scene when the page opens with ?shot=start|play|end&seed=N, otherwise runs
// the title screen and lets the player fly.

import { STEP, VIEW } from './config.js';
import { Input } from './input.js';
import { render } from './render.js';
import { SoundBank } from './audio.js';
import { World, SCREEN_CRASHED, SCREEN_LANDED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TIMEOUT, SCREEN_TITLE, EVENT_LANDED, EVENT_OVER, EVENT_RING } from './world.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

const world = new World();
const input = new Input(canvas);
const sounds = new SoundBank();
let best = 0;
try {
  best = Number(localStorage.getItem('ridge-runner-best') ?? 0) || 0;
} catch {
  best = 0;
}
world.state.best = best;

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') ?? 1);
if (seed && Number.isFinite(seed)) {
  // The seed is read so a staged shot is reproducible; the world itself is
  // seeded from its fixed constant and the autopilot is deterministic.
  void seed;
}

function saveBest() {
  const s = world.state;
  if (s.score > s.best) {
    s.best = s.score;
    try {
      localStorage.setItem('ridge-runner-best', String(s.best));
    } catch {
      // Private mode: the best score simply does not persist.
    }
  }
}

function describe(state) {
  const p = state.plane;
  if (state.screen === SCREEN_TITLE) return 'Ridge Runner title screen. Press Enter to fly.';
  if (state.screen === SCREEN_PLAY) {
    return `Flying. Score ${state.score}, rings ${state.ringsHit} of 8, `
      + `altitude ${Math.round(p.y * 3.281)} feet, speed ${Math.round(p.speed * 1.944)} knots.`;
  }
  if (state.screen === SCREEN_CRASHED) return `Crashed. ${state.crashReason} Score ${state.score}. Press R to fly again.`;
  if (state.screen === SCREEN_LANDED) return `Delivered! Score ${state.score}. Press R to fly again.`;
  if (state.screen === SCREEN_TIMEOUT) return `Out of time. Score ${state.score}. Press R to fly again.`;
  return 'Ridge Runner paused.';
}

input.onStart = () => {
  sounds.ensure();
  if (world.state.screen === SCREEN_TITLE) {
    sounds.click();
    world.start();
  }
};
input.onClick = () => {
  sounds.ensure();
  if (world.state.screen === SCREEN_TITLE) {
    sounds.click();
    world.start();
  }
};
input.onPause = () => {
  const s = world.state;
  if (s.screen === SCREEN_PLAY) s.screen = SCREEN_PAUSED;
  else if (s.screen === SCREEN_PAUSED) s.screen = SCREEN_PLAY;
};
input.onRestart = () => {
  const s = world.state;
  if (s.screen === SCREEN_CRASHED || s.screen === SCREEN_LANDED || s.screen === SCREEN_TIMEOUT || s.screen === SCREEN_PAUSED) {
    saveBest();
    const keepBest = s.best;
    world.reset();
    world.state.best = keepBest;
    sounds.click();
  }
};
input.onMute = () => {
  sounds.muted = !sounds.muted;
};
input.onFirstGesture = () => sounds.ensure();

let staged = false;
if (shotName) {
  stageShot(shotName, world);
  staged = true;
}

let last = performance.now();
let accumulator = 0;
let frames = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const state = world.state;
  if (staged) {
    // A staged screenshot: one settled frame, then keep rendering it so the
    // capture sees exactly what the simulation produced.
    render(ctx, state);
    status.textContent = describe(state);
    return;
  }
  if (state.screen === SCREEN_PLAY) {
    accumulator += dt;
    let guard = 0;
    while (accumulator >= STEP && guard < 5) {
      const control = input.read(state.plane.throttle);
      const event = world.step(STEP, control);
      accumulator -= STEP;
      guard += 1;
      if (event & EVENT_RING) sounds.ring();
      if (event & EVENT_LANDED) {
        saveBest();
        sounds.landed();
      } else if (event & EVENT_OVER) {
        saveBest();
        if (state.screen === SCREEN_CRASHED) sounds.crash();
      }
    }
    if (guard >= 5) accumulator = 0;
  } else {
    // Title and end screens still age their blink and message timers.
    state.time += dt;
    if (state.screen === SCREEN_TITLE) state.plane.throttle = 0.12;
  }
  sounds.update(state.plane.throttle, state.plane.speed, state.plane.onGround, state.screen === SCREEN_PLAY || state.screen === SCREEN_TITLE);
  render(ctx, state);
  frames += 1;
  if (frames % 30 === 0) status.textContent = describe(state);
  requestAnimationFrame(frame);
}

render(ctx, world.state);
status.textContent = describe(world.state);
requestAnimationFrame(frame);
