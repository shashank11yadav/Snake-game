import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { cellOccupied, firstFood, openGame, runTicks } from './helpers.ts';

test('shows a title screen instead of starting on load', async ({ page }) => {
  const errors = await openGame(page);
  await runTicks(page, 30);
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'title');
  await expect(page.getByRole('heading', { name: 'Snake', exact: true })).toBeVisible();
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('starts with Space and steers with the arrow keys', async ({ page }) => {
  const errors = await openGame(page);
  const [fx, fy] = firstFood();
  // The cells checked below must not hold the apple for this seed.
  expect([fx, fy]).not.toEqual([10, 7]);

  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  await page.keyboard.press('ArrowUp');
  await runTicks(page, 3);
  // Head started at (10, 10) facing right; three ticks up puts it at (10, 7)
  // with the neck at (10, 8). Drawing trails the logic by under one tick
  // (render interpolation), so the checks look at the neck, which is solid.
  expect(await cellOccupied(page, 10, 8)).toBe(true);
  expect(await cellOccupied(page, 12, 10)).toBe(false);

  await page.keyboard.press('ArrowRight');
  await runTicks(page, 2);
  expect(await cellOccupied(page, 11, 7)).toBe(true);
  expect(await cellOccupied(page, 10, 6)).toBe(false);
  expect(errors).toEqual([]);
});

test('ignores reversals and unrelated keys', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift');
  await page.keyboard.press('KeyQ');
  await runTicks(page, 3);
  // Still heading right, neck at (12, 10). The old version turned up on any unknown key.
  expect(await cellOccupied(page, 12, 10)).toBe(true);
  expect(await cellOccupied(page, 10, 8)).toBe(false);
});

test('pauses and resumes, and pauses when the tab is hidden', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Space');
  await runTicks(page, 2);
  await page.keyboard.press('KeyP');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'paused');
  await expect(page.locator('#overlay-title')).toHaveText('Paused');
  // The live region is filled after a short delay so repeats are re-announced.
  await page.clock.runFor(50);
  await expect(page.locator('#live')).toHaveText('Paused');
  await runTicks(page, 20);
  // Paused with the head at (12, 10): nothing moved on.
  expect(await cellOccupied(page, 11, 10)).toBe(true);
  expect(await cellOccupied(page, 13, 10)).toBe(false);

  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  await runTicks(page, 2);
  expect(await cellOccupied(page, 13, 10)).toBe(true);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'paused');
});

test('ends on a wall hit, announces it, and restarts cleanly', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await runTicks(page, 12);
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'over');
  await expect(page.locator('#overlay-title')).toHaveText('Game over');
  await expect(page.locator('#overlay-text')).toContainText('Hit the wall');
  await page.clock.runFor(50);
  await expect(page.locator('#alert')).toContainText('Game over');

  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  await expect(page.locator('#score')).toHaveText('0');
  await runTicks(page, 1);
  // A fresh snake back in the middle (the old one died at the top wall).
  expect(await cellOccupied(page, 10, 10)).toBe(true);
  expect(await cellOccupied(page, 10, 1)).toBe(false);
});

test('the autopilot plays and scores on its own', async ({ page }) => {
  await openGame(page);
  await page.getByLabel('Watch the AI play').check();
  await page.getByLabel('Strategy').selectOption('hamiltonian');
  await page.getByRole('button', { name: 'Start' }).click();
  await runTicks(page, 300);
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  expect(Number(await page.locator('#score').textContent())).toBeGreaterThan(2);
  // Autopilot runs never touch the player's best score.
  await expect(page.locator('#best')).toHaveText('0');
});

test('survives corrupt saved data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'snake-autopilot:v1',
      '{"settings":{"size":999,"speed":"fast","__proto__":{"x":1}},"best":"oops"',
    );
  });
  const errors = await openGame(page);
  await expect(page.locator('#size')).toHaveValue('20');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'playing');
  expect(errors).toEqual([]);
});

test('has no detectable accessibility violations', async ({ page }) => {
  // Real clock here: axe relies on timers.
  await page.goto('./');
  const title = await new AxeBuilder({ page }).analyze();
  expect(title.violations).toEqual([]);
  await page.keyboard.press('Space');
  await page.keyboard.press('KeyP');
  await expect(page.locator('#app')).toHaveAttribute('data-phase', 'paused');
  const paused = await new AxeBuilder({ page }).analyze();
  expect(paused.violations).toEqual([]);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await new AxeBuilder({ page }).analyze();
  expect(dark.violations).toEqual([]);
});
