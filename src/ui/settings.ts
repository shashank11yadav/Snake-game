import { isStrategyId } from '../ai/index.ts';
import type { StrategyId } from '../ai/index.ts';
import type { Mode } from '../engine/types.ts';

export type Theme = 'system' | 'light' | 'dark';

export const BOARD_SIZES = [10, 16, 20] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

/** Ticks per second for each speed level. */
export const SPEEDS = [6, 9, 13, 20, 40] as const;

export interface Settings {
  mode: Mode;
  size: BoardSize;
  /** Index into SPEEDS. */
  speed: number;
  autopilot: boolean;
  strategy: StrategyId;
  showPath: boolean;
  muted: boolean;
  theme: Theme;
  /** null means "decide from the pointer type". */
  dpad: boolean | null;
}

export interface Saved {
  settings: Settings;
  /** Best score per `${mode}-${size}`. */
  best: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'walls',
  size: 20,
  speed: 1,
  autopilot: false,
  strategy: 'safe',
  showPath: true,
  muted: false,
  theme: 'system',
  dpad: null,
};

export const STORAGE_KEY = 'snake-autopilot:v1';

export function bestKey(mode: Mode, size: BoardSize): string {
  return `${mode}-${size}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoardSize(value: unknown): value is BoardSize {
  return BOARD_SIZES.some((s) => s === value);
}

/**
 * Rebuilds settings field by field from untrusted data. Anything missing,
 * of the wrong type or out of range falls back to the default, so a stale or
 * hand-edited localStorage entry can never put the game in a bad state.
 */
export function parseSettings(raw: unknown): Settings {
  const s = isRecord(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    mode: s.mode === 'walls' || s.mode === 'wrap' ? s.mode : d.mode,
    size: isBoardSize(s.size) ? s.size : d.size,
    speed:
      typeof s.speed === 'number' &&
      Number.isInteger(s.speed) &&
      s.speed >= 0 &&
      s.speed < SPEEDS.length
        ? s.speed
        : d.speed,
    autopilot: typeof s.autopilot === 'boolean' ? s.autopilot : d.autopilot,
    strategy: isStrategyId(s.strategy) ? s.strategy : d.strategy,
    showPath: typeof s.showPath === 'boolean' ? s.showPath : d.showPath,
    muted: typeof s.muted === 'boolean' ? s.muted : d.muted,
    theme: s.theme === 'light' || s.theme === 'dark' || s.theme === 'system' ? s.theme : d.theme,
    dpad: typeof s.dpad === 'boolean' ? s.dpad : null,
  };
}

/** Only known keys with whole, in-range scores survive. */
export function parseBest(raw: unknown): Record<string, number> {
  const best: Record<string, number> = {};
  if (!isRecord(raw)) return best;
  for (const mode of ['walls', 'wrap'] as const) {
    for (const size of BOARD_SIZES) {
      const key = bestKey(mode, size);
      const value = raw[key];
      if (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= size * size
      ) {
        best[key] = value;
      }
    }
  }
  return best;
}

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

/** localStorage throws in some private modes and when disabled, so every access is guarded. */
export function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadSaved(storage: ReadableStorage | null): Saved {
  let parsed: unknown = null;
  try {
    const text = storage?.getItem(STORAGE_KEY) ?? null;
    // Guard against someone stuffing megabytes into the key.
    if (text !== null && text.length < 10_000) parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const root = isRecord(parsed) ? parsed : {};
  return { settings: parseSettings(root.settings), best: parseBest(root.best) };
}

export function storeSaved(storage: WritableStorage | null, saved: Saved): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(saved));
    return storage !== null;
  } catch {
    return false;
  }
}
