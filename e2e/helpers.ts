import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createGame } from '../src/engine/game.ts';
import { toXY } from '../src/engine/grid.ts';

export const SEED = 7;
/** Default speed level is 9 moves per second. */
export const TICK_MS = 1000 / 9;

/** Where the first apple lands for SEED on the default 20x20 walls board. */
export function firstFood(): [number, number] {
  const g = createGame({ cols: 20, rows: 20, mode: 'walls', initialLength: 3 }, SEED);
  return toXY(20, g.food);
}

/**
 * Loads the game with a fake clock so ticks are exact, and collects console
 * errors (a CSP violation shows up there too).
 */
export async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto(`./?seed=${SEED}`);
  // Stop the clock so time only moves inside runTicks, not while the test
  // itself is busy sending keys.
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'title');
  return errors;
}

export async function runTicks(page: Page, ticks: number): Promise<void> {
  // A little past the boundary so the last tick has certainly fired.
  await page.clock.runFor(Math.ceil(ticks * TICK_MS + TICK_MS * 0.4));
}

/**
 * True if the canvas pixel at the centre of cell (x, y) is not a board
 * colour, i.e. something (snake or apple) is drawn there. Reading pixels
 * avoids adding any test-only hooks to the game.
 */
export async function cellOccupied(page: Page, x: number, y: number, cells = 20): Promise<boolean> {
  return page.evaluate(
    ([cx, cy, n]) => {
      const canvas = document.querySelector('canvas');
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) throw new Error('no canvas');
      const px = (v: number): number => Math.floor(((v + 0.5) / n) * canvas.width);
      const [r, g, b] = ctx.getImageData(px(cx), px(cy), 1, 1).data;
      const style = getComputedStyle(canvas);
      const probe = document.createElement('canvas').getContext('2d');
      if (!probe) throw new Error('no probe');
      const rgb = (css: string): number[] => {
        probe.fillStyle = css;
        probe.fillRect(0, 0, 1, 1);
        return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const boards = ['--board', '--board-alt'].map((v) => rgb(style.getPropertyValue(v).trim()));
      return !boards.some(
        ([br = 0, bg = 0, bb = 0]) =>
          Math.abs(br - (r ?? 0)) + Math.abs(bg - (g ?? 0)) + Math.abs(bb - (b ?? 0)) < 12,
      );
    },
    [x, y, cells] as const,
  );
}
