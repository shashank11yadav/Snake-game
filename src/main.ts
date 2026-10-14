import './styles.css';
import { STRATEGIES, STRATEGY_IDS, isStrategyId } from './ai/index.ts';
import { cyclesFor } from './ai/hamiltonian.ts';
import { createGame, queueTurn, step } from './engine/game.ts';
import type { Direction, GameConfig, GameState } from './engine/types.ts';
import { Sound } from './ui/audio.ts';
import { bindDpad, bindKeyboard, bindSwipe } from './ui/controls.ts';
import type { KeyAction } from './ui/input.ts';
import { planTicks } from './ui/loop.ts';
import { transition } from './ui/phase.ts';
import type { Phase, PhaseEvent } from './ui/phase.ts';
import { readPalette, Renderer } from './ui/renderer.ts';
import {
  bestKey,
  browserStorage,
  loadSaved,
  parseSettings,
  SPEEDS,
  storeSaved,
} from './ui/settings.ts';
import type { Saved, Theme } from './ui/settings.ts';

function $<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`Missing #${id}`);
  return el;
}

const ui = {
  app: $('app', HTMLElement),
  stage: $('stage', HTMLDivElement),
  canvas: $('board', HTMLCanvasElement),
  score: $('score', HTMLElement),
  best: $('best', HTMLElement),
  overlayTitle: $('overlay-title', HTMLHeadingElement),
  overlayText: $('overlay-text', HTMLParagraphElement),
  overlayHint: $('overlay-hint', HTMLParagraphElement),
  startBtn: $('start-btn', HTMLButtonElement),
  pauseBtn: $('pause-btn', HTMLButtonElement),
  muteBtn: $('mute-btn', HTMLButtonElement),
  themeBtn: $('theme-btn', HTMLButtonElement),
  dpad: $('dpad', HTMLDivElement),
  autopilot: $('autopilot', HTMLInputElement),
  strategy: $('strategy', HTMLSelectElement),
  strategyNote: $('strategy-note', HTMLParagraphElement),
  showPath: $('show-path', HTMLInputElement),
  mode: $('mode', HTMLSelectElement),
  size: $('size', HTMLSelectElement),
  speed: $('speed', HTMLInputElement),
  speedOut: $('speed-out', HTMLOutputElement),
  dpadToggle: $('dpad-toggle', HTMLInputElement),
  restartNote: $('restart-note', HTMLParagraphElement),
  live: $('live', HTMLDivElement),
  alert: $('alert', HTMLDivElement),
};

const storage = browserStorage();
const saved: Saved = loadSaved(storage);
const settings = saved.settings;
const sound = new Sound();
sound.muted = settings.muted;
const renderer = new Renderer(ui.canvas);
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

/** A ?seed=123 query makes the first game reproducible (used for the demo capture). */
function initialSeed(): number | null {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  return Number(raw) >>> 0;
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

let pendingSeed = initialSeed();
let phase: Phase = 'title';
let curr: GameState = createGame(currentConfig(), pendingSeed ?? randomSeed());
let prev: GameState = curr;
let path: readonly number[] = [];
let assisted = false;
let accumulator = 0;
let lastFrame = 0;
let rafId = 0;
let lastAnnounce = 0;
/** Interpolation factor of the last drawn frame, kept so pausing does not make the snake jump. */
let alpha = 1;

function currentConfig(): GameConfig {
  return { cols: settings.size, rows: settings.size, mode: settings.mode, initialLength: 3 };
}

function persist(): void {
  storeSaved(storage, saved);
}

function tickMs(): number {
  return 1000 / (SPEEDS[settings.speed] ?? 9);
}

function announce(text: string, urgent = false): void {
  const region = urgent ? ui.alert : ui.live;
  // Clearing first makes screen readers repeat an identical message.
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = text;
  }, 30);
}

function bestScore(): number {
  return saved.best[bestKey(settings.mode, settings.size)] ?? 0;
}

function updateHud(): void {
  ui.score.textContent = String(curr.score);
  ui.best.textContent = String(bestScore());
}

function updateOverlay(): void {
  ui.app.dataset.phase = phase;
  ui.pauseBtn.setAttribute('aria-label', phase === 'paused' ? 'Resume' : 'Pause');
  ui.pauseBtn.disabled = phase === 'title' || phase === 'over';
  if (phase === 'title') {
    ui.overlayTitle.textContent = 'Snake';
    ui.overlayText.textContent = settings.autopilot
      ? `The autopilot (${STRATEGIES[settings.strategy].label}) will play. Steer to take over.`
      : 'Eat the apples. Avoid the walls and your own tail.';
    ui.startBtn.textContent = 'Start';
  } else if (phase === 'paused') {
    ui.overlayTitle.textContent = 'Paused';
    ui.overlayText.textContent = `Score ${curr.score}.`;
    ui.startBtn.textContent = 'Resume';
  } else if (phase === 'over') {
    const won = curr.status === 'won';
    ui.overlayTitle.textContent = won ? 'Board filled' : 'Game over';
    const cause = curr.deathCause === 'wall' ? 'Hit the wall' : 'Ran into itself';
    const note = assisted ? ' Autopilot runs do not count toward your best.' : '';
    ui.overlayText.textContent = `${won ? 'Every cell is snake.' : `${cause}.`} Score ${curr.score}.${note}`;
    ui.startBtn.textContent = 'Play again';
  }
  if (coarsePointer)
    ui.overlayHint.textContent = 'Tap the board to play. Swipe or use the arrows to steer.';
  ui.restartNote.hidden = phase !== 'playing' && phase !== 'paused';
}

function draw(now: number): void {
  renderer.draw({
    prev,
    curr,
    alpha,
    path: settings.autopilot && settings.showPath ? path : [],
    now,
    reducedMotion: reducedMotionQuery.matches,
  });
}

function isPlaying(): boolean {
  return phase === 'playing';
}

function frame(now: number): void {
  rafId = 0;
  const elapsed = lastFrame === 0 ? 0 : now - lastFrame;
  lastFrame = now;
  if (phase === 'playing') {
    const ms = tickMs();
    const plan = planTicks(accumulator, elapsed, ms);
    accumulator = plan.accumulator;
    // tick() can end the game, so re-read the phase through a call.
    for (let i = 0; i < plan.ticks && isPlaying(); i++) tick(now);
    alpha = isPlaying() ? accumulator / ms : 1;
  }
  draw(now);
  if (phase === 'playing' || renderer.animating(now)) schedule();
  else lastFrame = 0;
}

function schedule(): void {
  if (rafId === 0) rafId = requestAnimationFrame(frame);
}

function setPhase(event: PhaseEvent): void {
  const next = transition(phase, event);
  if (next === phase) return;
  phase = next;
  updateOverlay();
  if (phase === 'paused') announce('Paused');
  if (phase === 'playing') {
    lastFrame = 0;
    ui.canvas.focus({ preventScroll: true });
  }
  schedule();
}

function tick(now: number): void {
  prev = curr;
  if (settings.autopilot) {
    assisted = true;
    const decision = STRATEGIES[settings.strategy].decide(curr, settings.showPath);
    curr = step(curr, decision.dir);
    path = decision.path.slice(1);
  } else {
    curr = step(curr);
    path = [];
  }

  if (curr.score > prev.score) {
    sound.eat();
    renderer.eatAt(prev.food, curr.config.cols, now);
    updateHud();
    // Throttled so a fast autopilot does not flood the screen reader.
    if (now - lastAnnounce > 2000) {
      lastAnnounce = now;
      announce(`Score ${curr.score}`);
    }
  }
  if (curr.status !== 'playing') endGame(now);
}

function endGame(now: number): void {
  const won = curr.status === 'won';
  if (won) sound.win();
  else {
    sound.die();
    renderer.died(now);
  }
  let record = '';
  if (!assisted && curr.score > bestScore()) {
    saved.best[bestKey(settings.mode, settings.size)] = curr.score;
    persist();
    record = ' New best!';
  }
  path = [];
  updateHud();
  setPhase('end');
  announce(`${won ? 'You filled the board' : 'Game over'}. Score ${curr.score}.${record}`, true);
}

function newGame(): void {
  curr = createGame(currentConfig(), pendingSeed ?? randomSeed());
  pendingSeed = null;
  prev = curr;
  alpha = 1;
  accumulator = 0;
  path = [];
  assisted = settings.autopilot;
  renderer.reset();
  updateHud();
  syncBoardLabel();
}

function startOrResume(): void {
  sound.unlock();
  if (phase === 'title' || phase === 'over') {
    if (phase === 'over') newGame();
    sound.start();
    announce(settings.autopilot ? 'Autopilot started' : 'Game started');
  }
  setPhase('start');
}

function turn(dir: Direction): void {
  if (phase !== 'playing') return;
  if (settings.autopilot) {
    // Steering during an autopilot run hands control back to the player.
    settings.autopilot = false;
    ui.autopilot.checked = false;
    path = [];
    persist();
    announce('Autopilot off, you have control');
  }
  curr = queueTurn(curr, dir);
}

function togglePause(): void {
  if (phase === 'paused') startOrResume();
  else setPhase('pause');
}

function onAction(action: KeyAction): void {
  switch (action.type) {
    case 'turn':
      turn(action.dir);
      break;
    case 'start':
      if (phase === 'playing') setPhase('pause');
      else startOrResume();
      break;
    case 'pause':
      togglePause();
      break;
    case 'mute':
      setMuted(!settings.muted);
      break;
    case 'autopilot':
      ui.autopilot.checked = !ui.autopilot.checked;
      applySettingsFromForm();
      break;
  }
}

function setMuted(muted: boolean): void {
  settings.muted = muted;
  sound.muted = muted;
  ui.muteBtn.setAttribute('aria-pressed', String(!muted));
  ui.muteBtn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
  persist();
}

const THEMES: readonly Theme[] = ['system', 'light', 'dark'];

function applyTheme(): void {
  if (settings.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
  ui.themeBtn.setAttribute('aria-label', `Theme: ${settings.theme}`);
  ui.themeBtn.title = `Theme: ${settings.theme}`;
  renderer.setPalette(readPalette(ui.canvas));
  draw(performance.now());
}

function applyDpad(): void {
  const on = settings.dpad ?? coarsePointer;
  ui.app.dataset.dpad = on ? 'on' : 'off';
  ui.dpadToggle.checked = on;
  fitBoard();
}

function syncBoardLabel(): void {
  const { cols, rows, mode } = curr.config;
  ui.canvas.setAttribute(
    'aria-label',
    `Snake board, ${cols} by ${rows}, ${mode === 'wrap' ? 'edges wrap around' : 'walls on the edges'}`,
  );
}

function strategyNote(): string {
  const id = settings.strategy;
  if ((id === 'cycle' || id === 'hamiltonian') && !cyclesFor(currentConfig())) {
    return 'This board has no Hamiltonian cycle, so Safe A* is used instead.';
  }
  const notes: Record<typeof id, string> = {
    greedy: 'Shortest path to the apple. Fast, but walks into dead ends.',
    safe: 'Shortest path, but only if it can still reach its tail after eating.',
    cycle: 'Follows a fixed loop through every cell. Slow, never dies.',
    hamiltonian: 'Follows the loop and cuts across it when that is provably safe.',
  };
  return notes[id];
}

function applySettingsFromForm(): void {
  const before = { mode: settings.mode, size: settings.size };
  const next = parseSettings({
    ...settings,
    autopilot: ui.autopilot.checked,
    strategy: ui.strategy.value,
    showPath: ui.showPath.checked,
    mode: ui.mode.value,
    size: Number(ui.size.value),
    speed: Number(ui.speed.value),
    dpad: ui.dpadToggle.checked,
  });
  const autopilotTurnedOn = next.autopilot && !settings.autopilot;
  Object.assign(settings, next);
  if (autopilotTurnedOn && phase !== 'title') assisted = true;
  if (!settings.autopilot) path = [];
  ui.speedOut.textContent = `${SPEEDS[settings.speed] ?? 9} moves/s`;
  ui.strategyNote.textContent = strategyNote();
  applyDpad();
  persist();

  const boardChanged = before.mode !== settings.mode || before.size !== settings.size;
  // Mid-game changes to the board would teleport the snake, so they wait for the next game.
  if (boardChanged && (phase === 'title' || phase === 'over')) {
    newGame();
    if (phase === 'over') phase = 'title';
  }
  updateHud();
  updateOverlay();
  draw(performance.now());
}

function populateForm(): void {
  for (const id of STRATEGY_IDS) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = STRATEGIES[id].label;
    ui.strategy.append(option);
  }
  ui.autopilot.checked = settings.autopilot;
  ui.strategy.value = settings.strategy;
  ui.showPath.checked = settings.showPath;
  ui.mode.value = settings.mode;
  ui.size.value = String(settings.size);
  ui.speed.value = String(settings.speed);
  ui.speedOut.textContent = `${SPEEDS[settings.speed] ?? 9} moves/s`;
  ui.strategyNote.textContent = strategyNote();
}

/** Largest square that fits the column width and leaves room for the HUD and d-pad on screen. */
function fitBoard(): void {
  const dpadOn = ui.app.dataset.dpad === 'on';
  const reserved = dpadOn ? 300 : 130;
  const width = ui.stage.parentElement?.clientWidth ?? window.innerWidth;
  const size = Math.max(200, Math.min(width, 640, window.innerHeight - reserved));
  ui.app.style.setProperty('--board-size', `${Math.floor(size)}px`);
  renderer.resize();
  draw(performance.now());
}

function bindUi(): void {
  bindKeyboard({ onAction, onTap: startOrResume });
  bindSwipe(ui.stage, {
    onAction,
    onTap: () => {
      if (phase !== 'playing') startOrResume();
    },
  });
  bindDpad(ui.dpad, (dir) => {
    sound.unlock();
    if (phase === 'title' || phase === 'over') startOrResume();
    turn(dir);
  });
  ui.startBtn.addEventListener('click', startOrResume);
  ui.pauseBtn.addEventListener('click', togglePause);
  ui.muteBtn.addEventListener('click', () => {
    sound.unlock();
    setMuted(!settings.muted);
  });
  ui.themeBtn.addEventListener('click', () => {
    settings.theme = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length] ?? 'system';
    persist();
    applyTheme();
  });
  document.getElementById('settings')?.addEventListener('change', applySettingsFromForm);
  ui.speed.addEventListener('input', applySettingsFromForm);
  document.getElementById('settings')?.addEventListener('submit', (e) => {
    e.preventDefault();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPhase('hide');
  });
  window.addEventListener('blur', () => {
    setPhase('hide');
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  new ResizeObserver(fitBoard).observe(ui.stage.parentElement ?? document.body);
  window.addEventListener('resize', fitBoard);
}

function init(): void {
  if (!isStrategyId(settings.strategy)) settings.strategy = 'safe';
  populateForm();
  setMuted(settings.muted);
  bindUi();
  applyDpad();
  applyTheme();
  updateHud();
  updateOverlay();
  syncBoardLabel();
}

init();
