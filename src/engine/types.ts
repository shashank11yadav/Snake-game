export type Direction = 'up' | 'down' | 'left' | 'right';

/** 'walls' kills on the border, 'wrap' teleports to the opposite side. */
export type Mode = 'walls' | 'wrap';

export type Status = 'playing' | 'dead' | 'won';

export type DeathCause = 'wall' | 'self';

export interface GameConfig {
  readonly cols: number;
  readonly rows: number;
  readonly mode: Mode;
  /** Starting length of the snake. */
  readonly initialLength: number;
}

/**
 * Cells are stored as flat indices (y * cols + x). Integers are cheap to
 * compare, hash and copy, which matters when the autopilot simulates
 * thousands of moves per decision during benchmarks.
 */
export interface GameState {
  readonly config: GameConfig;
  /** Head first, tail last. */
  readonly snake: readonly number[];
  readonly dir: Direction;
  /** Turns waiting to be applied, one per tick, at most two. */
  readonly queue: readonly Direction[];
  /** -1 once the board is full. */
  readonly food: number;
  readonly score: number;
  readonly ticks: number;
  readonly status: Status;
  readonly deathCause: DeathCause | null;
  /** PRNG state, advanced only when food is placed. */
  readonly seed: number;
}
