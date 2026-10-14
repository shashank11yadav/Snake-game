import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cellOccupied, openGame, runTicks } from './helpers.ts';

/** Real touch events through the DevTools protocol, which Chromium turns into pointer events. */
async function swipe(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const point = (x: number, y: number): { x: number; y: number }[] => [{ x, y }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(...from) });
  for (let i = 1; i <= 5; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / 5;
    const y = from[1] + ((to[1] - from[1]) * i) / 5;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x, y) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('fits a phone screen without horizontal scrolling', async ({ page }) => {
  await openGame(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await page.locator('#stage').boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  await expect(page.locator('#dpad')).toBeVisible();
});

test('tap starts the game and a swipe steers', async ({ page }) => {
  await openGame(page);
  const box = await page.locator('#stage').boundingBox();
  if (!box) throw new Error('no stage');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.touchscreen.tap(cx, cy);
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');

  await swipe(page, [cx, cy], [cx, cy - 80]);
  await runTicks(page, 3);
  expect(await cellOccupied(page, 10, 8)).toBe(true);
  expect(await cellOccupied(page, 12, 10)).toBe(false);
});

test('the on-screen d-pad steers', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: 'Start' }).tap();
  await page.getByRole('button', { name: 'Down' }).tap();
  await runTicks(page, 3);
  expect(await cellOccupied(page, 10, 12)).toBe(true);
  expect(await cellOccupied(page, 12, 10)).toBe(false);
});
