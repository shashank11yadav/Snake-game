import type { Direction } from '../engine/types.ts';
import { keyAction, swipeDirection } from './input.ts';
import type { KeyAction } from './input.ts';

export interface ControlHandlers {
  onAction(action: KeyAction): void;
  /** A tap on the board that was not a swipe. */
  onTap(): void;
}

/** Elements that need arrow keys, Space and Enter for themselves. Links keep Enter. */
function ownsKeys(target: EventTarget | null): 'all' | 'activate' | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target instanceof HTMLSelectElement || target instanceof HTMLInputElement) return 'all';
  if (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement ||
    (target instanceof HTMLElement && target.tagName === 'SUMMARY')
  ) {
    return 'activate';
  }
  return null;
}

export function bindKeyboard(handlers: ControlHandlers): void {
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const action = keyAction(event.code);
    if (!action) return;
    const owner = ownsKeys(event.target);
    if (owner === 'all' && (action.type === 'turn' || action.type === 'start')) return;
    if (owner === 'activate' && action.type === 'start') return;
    // Holding a key auto-repeats; only steering benefits from that.
    if (event.repeat && action.type !== 'turn') return;
    event.preventDefault();
    handlers.onAction(action);
  });
}

/** Minimum travel in CSS pixels before a drag counts as a swipe. */
const SWIPE_PX = 22;

/**
 * Swipes are read from pointer events so mouse drags and touch work the same
 * way. The origin resets after each recognised swipe, so one continuous
 * gesture can chain turns (right, then down) without lifting the finger.
 */
export function bindSwipe(el: HTMLElement, handlers: ControlHandlers): void {
  let origin: { x: number; y: number; id: number } | null = null;
  let swiped = false;

  el.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    origin = { x: event.clientX, y: event.clientY, id: event.pointerId };
    swiped = false;
  });
  el.addEventListener('pointermove', (event) => {
    if (origin?.id !== event.pointerId) return;
    const dir = swipeDirection(event.clientX - origin.x, event.clientY - origin.y, SWIPE_PX);
    if (!dir) return;
    swiped = true;
    origin = { ...origin, x: event.clientX, y: event.clientY };
    handlers.onAction({ type: 'turn', dir });
  });
  const end = (event: PointerEvent): void => {
    if (origin?.id !== event.pointerId) return;
    const wasTap = !swiped && event.type === 'pointerup';
    origin = null;
    // Buttons inside the overlay handle their own clicks.
    if (wasTap && !(event.target instanceof HTMLButtonElement)) handlers.onTap();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

export function bindDpad(el: HTMLElement, onTurn: (dir: Direction) => void): void {
  const dirOf = (target: EventTarget | null): Direction | null => {
    const button = target instanceof Element ? target.closest('button[data-dir]') : null;
    const dir = button?.getAttribute('data-dir');
    return dir === 'up' || dir === 'down' || dir === 'left' || dir === 'right' ? dir : null;
  };
  // pointerdown fires on touch contact, a click only on release, which feels late.
  el.addEventListener('pointerdown', (event) => {
    const dir = dirOf(event.target);
    if (!dir) return;
    event.preventDefault();
    onTurn(dir);
  });
  // Keyboard activation (Enter/Space on a focused arrow) arrives as a click with detail 0.
  el.addEventListener('click', (event) => {
    const dir = dirOf(event.target);
    if (dir && event.detail === 0) onTurn(dir);
  });
}
