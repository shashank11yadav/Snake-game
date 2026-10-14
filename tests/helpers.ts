import { toIndex } from '../src/engine/grid.ts';
import type { Direction, GameConfig, GameState } from '../src/engine/types.ts';

export function config(cols: number, rows: number, mode: GameConfig['mode'] = 'walls'): GameConfig {
  return { cols, rows, mode, initialLength: 3 };
}

/** Builds a state by hand from [x, y] pairs, head first. */
export function stateFrom(
  cfg: GameConfig,
  body: readonly (readonly [number, number])[],
  dir: Direction,
  food: readonly [number, number] | null,
  seed = 1,
): GameState {
  return {
    config: cfg,
    snake: body.map(([x, y]) => toIndex(cfg.cols, x, y)),
    dir,
    queue: [],
    food: food ? toIndex(cfg.cols, food[0], food[1]) : -1,
    score: 0,
    ticks: 0,
    status: 'playing',
    deathCause: null,
    seed,
  };
}
