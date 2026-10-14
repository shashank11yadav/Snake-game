import type { Direction } from '../engine/types.ts';

export type KeyAction =
  | { readonly type: 'turn'; readonly dir: Direction }
  | { readonly type: 'start' }
  | { readonly type: 'pause' }
  | { readonly type: 'mute' }
  | { readonly type: 'autopilot' };

const KEYS: Readonly<Record<string, KeyAction>> = {
  ArrowUp: { type: 'turn', dir: 'up' },
  ArrowDown: { type: 'turn', dir: 'down' },
  ArrowLeft: { type: 'turn', dir: 'left' },
  ArrowRight: { type: 'turn', dir: 'right' },
  KeyW: { type: 'turn', dir: 'up' },
  KeyS: { type: 'turn', dir: 'down' },
  KeyA: { type: 'turn', dir: 'left' },
  KeyD: { type: 'turn', dir: 'right' },
  Space: { type: 'start' },
  Enter: { type: 'start' },
  NumpadEnter: { type: 'start' },
  KeyP: { type: 'pause' },
  Escape: { type: 'pause' },
  KeyM: { type: 'mute' },
  KeyI: { type: 'autopilot' },
};

/**
 * Maps a physical key (KeyboardEvent.code, so WASD works on any layout) to an
 * action. Anything unmapped returns null and is left alone, which is the fix
 * for the old version turning the snake up on Shift or Tab.
 */
export function keyAction(code: string): KeyAction | null {
  return Object.hasOwn(KEYS, code) ? (KEYS[code] ?? null) : null;
}

/** Direction of a swipe, or null if it is shorter than `threshold` on both axes. */
export function swipeDirection(dx: number, dy: number, threshold: number): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}
