import { neighbor, OPPOSITE, toIndex } from './grid.ts';
import { normalizeSeed, randomInt } from './rng.ts';
import type { Direction, GameConfig, GameState } from './types.ts';

export const MAX_QUEUED_TURNS = 2;

export const DEFAULT_CONFIG: GameConfig = {
  cols: 20,
  rows: 20,
  mode: 'walls',
  initialLength: 3,
};

export function validateConfig(config: GameConfig): void {
  const { cols, rows, initialLength } = config;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 4 || rows < 4) {
    throw new RangeError(`Board must be at least 4x4 integers, got ${cols}x${rows}`);
  }
  if (
    !Number.isInteger(initialLength) ||
    initialLength < 1 ||
    initialLength > Math.floor(cols / 2) + 1
  ) {
    throw new RangeError(`initialLength ${initialLength} does not fit a ${cols}-wide board`);
  }
}

/**
 * Picks a free cell uniformly at random. Counting free cells and walking to
 * the k-th one gives every free cell exactly the same chance, unlike retrying
 * random cells (unbounded on a nearly full board) or picking from the whole
 * board and nudging to the nearest free cell (biased toward cells after the
 * snake).
 */
export function spawnFood(
  cellCount: number,
  occupied: readonly number[],
  seed: number,
): [food: number, nextSeed: number] {
  const taken = new Uint8Array(cellCount);
  let free = cellCount;
  for (const cell of occupied) {
    if (taken[cell] === 0) free--;
    taken[cell] = 1;
  }
  if (free <= 0) return [-1, seed];
  const [k, nextSeed] = randomInt(seed, free);
  let seen = 0;
  for (let i = 0; i < cellCount; i++) {
    if (taken[i] === 0) {
      if (seen === k) return [i, nextSeed];
      seen++;
    }
  }
  // Unreachable: k < free guarantees a hit above.
  return [-1, nextSeed];
}

export function createGame(config: GameConfig = DEFAULT_CONFIG, seed = 1): GameState {
  validateConfig(config);
  const y = Math.floor(config.rows / 2);
  const headX = Math.floor(config.cols / 2);
  const snake: number[] = [];
  for (let i = 0; i < config.initialLength; i++) snake.push(toIndex(config.cols, headX - i, y));
  const [food, nextSeed] = spawnFood(config.cols * config.rows, snake, normalizeSeed(seed));
  return {
    config,
    snake,
    dir: 'right',
    queue: [],
    food,
    score: 0,
    ticks: 0,
    status: 'playing',
    deathCause: null,
    seed: nextSeed,
  };
}

/**
 * Buffers a turn so two quick key presses inside one tick (e.g. up then left
 * to make a U-turn) both land instead of the second overwriting the first.
 * A turn is checked against the last *queued* direction, not the current one,
 * which is what blocks a 180 degree reversal sneaking in through the buffer.
 */
export function queueTurn(state: GameState, dir: Direction): GameState {
  if (state.status !== 'playing' || state.queue.length >= MAX_QUEUED_TURNS) return state;
  const last = state.queue.at(-1) ?? state.dir;
  if (dir === last || dir === OPPOSITE[last]) return state;
  return { ...state, queue: [...state.queue, dir] };
}

/**
 * Advances the game by one tick. `input` is a direct steer for this tick (the
 * autopilot uses it); without it the next queued turn is applied. Pure: the
 * same state and input always give the same result.
 */
export function step(state: GameState, input?: Direction): GameState {
  if (state.status !== 'playing') return state;
  const { config } = state;

  let dir = state.dir;
  let queue = state.queue;
  if (input !== undefined) {
    if (input !== OPPOSITE[state.dir]) dir = input;
    queue = [];
  } else if (queue.length > 0) {
    dir = queue[0] ?? dir;
    queue = queue.slice(1);
  }

  const head = state.snake[0] ?? 0;
  const next = neighbor(config, head, dir);
  const ticks = state.ticks + 1;
  if (next === -1) {
    return { ...state, dir, queue, ticks, status: 'dead', deathCause: 'wall' };
  }

  const eating = next === state.food;
  // The tail cell is vacated on this tick unless the snake grows, so moving
  // into it is legal. Checking the whole body here would kill a snake that
  // is just chasing its own tail.
  const blockingLength = eating ? state.snake.length : state.snake.length - 1;
  for (let i = 0; i < blockingLength; i++) {
    if (state.snake[i] === next) {
      return { ...state, dir, queue, ticks, status: 'dead', deathCause: 'self' };
    }
  }

  const snake = [next, ...state.snake];
  if (!eating) snake.pop();

  if (!eating) return { ...state, snake, dir, queue, ticks };

  const [food, seed] = spawnFood(config.cols * config.rows, snake, state.seed);
  return {
    ...state,
    snake,
    dir,
    queue,
    ticks,
    food,
    seed,
    score: state.score + 1,
    status: food === -1 ? 'won' : 'playing',
  };
}
