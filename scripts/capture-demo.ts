/**
 * Records docs/autopilot.gif: the Hamiltonian autopilot filling a 10x10
 * board. Playwright drives the production build with a fake clock, so every
 * frame lands exactly on a game tick, and ffmpeg turns the PNG frames into a
 * palette-optimised GIF.
 *
 *   npm run build && npm run capture -- [--frames-dir /tmp/snake-scratch/frames]
 *
 * Needs ffmpeg on the PATH.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    'frames-dir': { type: 'string', default: join(tmpdir(), 'snake-demo-frames') },
    seed: { type: 'string', default: '3' },
    out: { type: 'string', default: 'docs/autopilot.gif' },
  },
});

const PORT = 5503;
const framesDir = resolve(values['frames-dir']);
const out = resolve(values.out);
const TICK_MS = 1000 / 40; // speed level 5

/** Ticks between captured frames: every move early on, then faster so the whole fill fits in a short clip. */
function stride(tick: number): number {
  if (tick < 120) return 2;
  if (tick < 700) return 6;
  return 12;
}

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Preview server did not start at ${url}`);
}

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  // Own process group, so killing it also stops the vite child that npx starts.
  detached: true,
});

try {
  const base = `http://localhost:${PORT}/Snake-game/`;
  await waitForServer(base);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 900, height: 700 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto(`${base}?seed=${values.seed}`);
  await page.locator('#size').selectOption('10');
  await page.getByLabel('Watch the AI play').check();
  await page.getByLabel('Strategy').selectOption('hamiltonian');
  await page.locator('#speed').fill('4');
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await page.getByRole('button', { name: 'Start' }).click();

  const stage = page.locator('#stage');
  let frame = 0;
  let tick = 0;
  const shot = async (): Promise<void> => {
    await stage.screenshot({ path: join(framesDir, `f${String(frame++).padStart(4, '0')}.png`) });
  };
  await shot();
  while ((await page.locator('#app').getAttribute('data-phase')) === 'playing' && tick < 5000) {
    const n = stride(tick);
    await page.clock.runFor(Math.round(n * TICK_MS));
    tick += n;
    await shot();
  }
  // Hold on the finished board for a second and a half.
  await page.clock.runFor(1000);
  for (let i = 0; i < 30; i++) await shot();
  await browser.close();
  console.log(`captured ${frame} frames over ${tick} ticks`);
} finally {
  try {
    if (server.pid !== undefined) process.kill(-server.pid);
  } catch {
    // Already gone.
  }
}

const filters =
  'fps=20,scale=320:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=32:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle';
const ff = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    '20',
    '-i',
    join(framesDir, 'f%04d.png'),
    '-vf',
    filters,
    out,
  ],
  { stdio: 'inherit' },
);
if (ff.status !== 0) throw new Error('ffmpeg failed (is it installed?)');
console.log(`wrote ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
