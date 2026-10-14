import { describe, expect, it } from 'vitest';
import { keyAction, swipeDirection } from '../src/ui/input.ts';
import { MAX_FRAME_MS, planTicks } from '../src/ui/loop.ts';
import { transition } from '../src/ui/phase.ts';
import type { Phase, PhaseEvent } from '../src/ui/phase.ts';
import {
  DEFAULT_SETTINGS,
  loadSaved,
  parseBest,
  parseSettings,
  STORAGE_KEY,
  storeSaved,
} from '../src/ui/settings.ts';

describe('phase machine', () => {
  const cases: [Phase, PhaseEvent, Phase][] = [
    ['title', 'start', 'playing'],
    ['title', 'pause', 'title'],
    ['title', 'hide', 'title'],
    ['playing', 'pause', 'paused'],
    ['playing', 'hide', 'paused'],
    ['playing', 'end', 'over'],
    ['playing', 'start', 'playing'],
    ['paused', 'start', 'playing'],
    ['paused', 'pause', 'playing'],
    ['paused', 'hide', 'paused'],
    ['paused', 'end', 'paused'],
    ['over', 'start', 'playing'],
    ['over', 'pause', 'over'],
  ];
  it.each(cases)('%s + %s -> %s', (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });
});

describe('fixed timestep', () => {
  it('runs whole ticks and carries the remainder', () => {
    expect(planTicks(0, 16, 100)).toEqual({ ticks: 0, accumulator: 16 });
    expect(planTicks(90, 16, 100)).toEqual({ ticks: 1, accumulator: 6 });
    expect(planTicks(0, 205, 50)).toEqual({ ticks: 4, accumulator: 5 });
  });

  it('caps a long stall instead of replaying every missed tick', () => {
    const plan = planTicks(0, 5000, 10);
    expect(plan.ticks).toBe(MAX_FRAME_MS / 10);
  });

  it('treats negative frame times (clock skew) as zero', () => {
    expect(planTicks(10, -50, 100)).toEqual({ ticks: 0, accumulator: 10 });
  });

  it('is independent of frame rate', () => {
    // One second at 30, 60 and 144 fps gives the same number of 10/s ticks.
    for (const fps of [30, 60, 144]) {
      let acc = 0;
      let ticks = 0;
      for (let i = 0; i < fps; i++) {
        const plan = planTicks(acc, 1000 / fps, 100);
        acc = plan.accumulator;
        ticks += plan.ticks;
      }
      expect(ticks + Math.round(acc / 100)).toBe(10);
    }
  });
});

describe('keyboard mapping', () => {
  it('maps arrows and WASD to turns', () => {
    expect(keyAction('ArrowUp')).toEqual({ type: 'turn', dir: 'up' });
    expect(keyAction('KeyD')).toEqual({ type: 'turn', dir: 'right' });
  });

  it('maps Space and Enter to start, P and Escape to pause', () => {
    expect(keyAction('Space')).toEqual({ type: 'start' });
    expect(keyAction('Enter')).toEqual({ type: 'start' });
    expect(keyAction('KeyP')).toEqual({ type: 'pause' });
    expect(keyAction('Escape')).toEqual({ type: 'pause' });
  });

  it('ignores unknown keys, including inherited object keys', () => {
    for (const code of ['ShiftLeft', 'Tab', 'KeyQ', 'toString', '__proto__', '']) {
      expect(keyAction(code)).toBeNull();
    }
  });
});

describe('swipe detection', () => {
  it('needs a minimum distance', () => {
    expect(swipeDirection(10, 5, 20)).toBeNull();
  });
  it('picks the dominant axis', () => {
    expect(swipeDirection(40, 10, 20)).toBe('right');
    expect(swipeDirection(-40, 30, 20)).toBe('left');
    expect(swipeDirection(5, -30, 20)).toBe('up');
    expect(swipeDirection(-10, 25, 20)).toBe('down');
  });
});

describe('saved settings', () => {
  const store = (text: string | null): Pick<Storage, 'getItem'> => ({ getItem: () => text });

  it('falls back to defaults when nothing is saved', () => {
    expect(loadSaved(store(null))).toEqual({ settings: DEFAULT_SETTINGS, best: {} });
    expect(loadSaved(null)).toEqual({ settings: DEFAULT_SETTINGS, best: {} });
  });

  it('survives invalid JSON, wrong shapes and a throwing storage', () => {
    expect(loadSaved(store('{not json')).settings).toEqual(DEFAULT_SETTINGS);
    expect(loadSaved(store('[1,2,3]')).settings).toEqual(DEFAULT_SETTINGS);
    expect(loadSaved(store('null')).settings).toEqual(DEFAULT_SETTINGS);
    const throwing = {
      getItem: (): string => {
        throw new Error('SecurityError');
      },
    };
    expect(loadSaved(throwing).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores oversized values', () => {
    const huge = JSON.stringify({ settings: { mode: 'wrap' }, pad: 'x'.repeat(20_000) });
    expect(loadSaved(store(huge)).settings.mode).toBe('walls');
  });

  it('keeps valid fields and replaces invalid ones', () => {
    const s = parseSettings({
      mode: 'wrap',
      size: 13,
      speed: 2.5,
      autopilot: 'yes',
      strategy: 'hamiltonian',
      showPath: false,
      muted: true,
      theme: 'neon',
      dpad: true,
    });
    expect(s).toEqual({
      ...DEFAULT_SETTINGS,
      mode: 'wrap',
      strategy: 'hamiltonian',
      showPath: false,
      muted: true,
      dpad: true,
    });
  });

  it('rejects prototype keys as a strategy', () => {
    expect(parseSettings({ strategy: 'constructor' }).strategy).toBe(DEFAULT_SETTINGS.strategy);
  });

  it('keeps only known best-score keys with in-range integers', () => {
    const best = parseBest(
      JSON.parse(
        '{"walls-20":12,"wrap-10":101,"walls-10":-1,"wrap-16":3.5,"walls-16":"9","__proto__":{"polluted":1},"other":5}',
      ),
    );
    expect(best).toEqual({ 'walls-20': 12 });
    expect(Object.getPrototypeOf(best)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('round-trips through storage and reports write failures', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
    const saved = { settings: { ...DEFAULT_SETTINGS, size: 10 as const }, best: { 'wrap-10': 7 } };
    expect(storeSaved(storage, saved)).toBe(true);
    expect(data.has(STORAGE_KEY)).toBe(true);
    expect(loadSaved(storage)).toEqual(saved);
    const full = {
      setItem: (): void => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(storeSaved(full, saved)).toBe(false);
    expect(storeSaved(null, saved)).toBe(false);
  });
});
