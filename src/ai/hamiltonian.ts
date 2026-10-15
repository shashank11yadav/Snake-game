import { directionBetween, toIndex } from '../engine/grid.ts';
import type { GameConfig, GameState } from '../engine/types.ts';
import { legalMoves } from './moves.ts';
import { safe } from './safe.ts';
import type { Decision, Strategy } from './types.ts';

export interface Cycle {
  /** order[i] is the i-th cell along the cycle. */
  readonly order: Int32Array;
  /** pos[cell] is that cell's index in `order`. */
  readonly pos: Int32Array;
}

/**
 * Builds a Hamiltonian cycle with a "comb" shape: snake through columns
 * 1..cols-1 row by row, then return up column 0. That closes only when the
 * number of rows is even; with an odd row count but even column count the
 * same shape is built on the transposed board. A grid where both sides are
 * odd has no Hamiltonian cycle at all (a checkerboard colouring argument),
 * so null is returned.
 */
export function buildCycle(cols: number, rows: number): Cycle | null {
  const transpose = rows % 2 !== 0;
  if (transpose && cols % 2 !== 0) return null;
  const w = transpose ? rows : cols;
  const h = transpose ? cols : rows;
  const cells: number[] = [];
  const add = (x: number, y: number): void => {
    cells.push(transpose ? toIndex(cols, y, x) : toIndex(cols, x, y));
  };
  for (let y = 0; y < h; y++) {
    if (y % 2 === 0) for (let x = 1; x < w; x++) add(x, y);
    else for (let x = w - 1; x >= 1; x--) add(x, y);
  }
  for (let y = h - 1; y >= 0; y--) add(0, y);

  const order = Int32Array.from(cells);
  const pos = new Int32Array(order.length);
  order.forEach((cell, i) => {
    pos[cell] = i;
  });
  return { order, pos };
}

function reversed(cycle: Cycle): Cycle {
  const order = cycle.order.slice().reverse();
  const pos = new Int32Array(order.length);
  order.forEach((cell, i) => {
    pos[cell] = i;
  });
  return { order, pos };
}

const cache = new Map<string, [Cycle, Cycle] | null>();

/** Both directions of the cycle, so a snake that starts facing "backwards" can still use it. */
export function cyclesFor(config: GameConfig): [Cycle, Cycle] | null {
  const key = `${config.cols}x${config.rows}`;
  if (!cache.has(key)) {
    const c = buildCycle(config.cols, config.rows);
    cache.set(key, c ? [c, reversed(c)] : null);
  }
  return cache.get(key) ?? null;
}

/** Steps forward along the cycle from a to b. */
function ahead(cycle: Cycle, a: number, b: number): number {
  const n = cycle.order.length;
  return ((cycle.pos[b] ?? 0) - (cycle.pos[a] ?? 0) + n) % n;
}

/**
 * The invariant that makes shortcuts safe: walking from tail to head, every
 * body cell sits strictly further along the cycle than the previous one, and
 * the whole body spans less than one lap. Then every cell ahead of the head
 * up to the tail is empty, and following the cycle can never hit the body.
 */
export function bodyFollowsCycle(cycle: Cycle, snake: readonly number[]): boolean {
  let span = 0;
  for (let i = snake.length - 1; i > 0; i--) {
    const gap = ahead(cycle, snake[i] ?? 0, snake[i - 1] ?? 0);
    if (gap === 0) return false;
    span += gap;
  }
  return span < cycle.order.length;
}

/**
 * Fraction of the board above which shortcuts stop. Every shortcut leaves
 * skipped cells behind the head that cannot be used again until the tail
 * passes them; while the snake is long those holes make the apple land
 * "behind" the head more often and cost a full lap. A sweep with
 * `npm run bench -- --sweep` put the best value at one half, which is also
 * the rule in John Tapsell's write-up of this approach.
 */
export const DEFAULT_SHORTCUT_CUTOFF = 0.5;

function choose(state: GameState, cycle: Cycle, cutoff: number): number {
  const { snake, food } = state;
  const n = cycle.order.length;
  const head = snake[0] ?? 0;
  const tail = snake.at(-1) ?? head;
  const next = cycle.order[((cycle.pos[head] ?? 0) + 1) % n] ?? head;
  if (snake.length > n * cutoff) return next;

  // Any cell strictly between the head and the tail (in cycle order) is empty,
  // so jumping there keeps the invariant. Not jumping past the apple avoids a
  // full extra lap to come back for it.
  const room = snake.length === 1 ? n : ahead(cycle, head, tail);
  const limit = food === -1 ? room - 1 : Math.min(room - 1, ahead(cycle, head, food));
  let best = next;
  let bestGain = 1;
  for (const move of legalMoves(state)) {
    const gain = ahead(cycle, head, move.cell);
    if (gain > bestGain && gain <= limit) {
      best = move.cell;
      bestGain = gain;
    }
  }
  return best;
}

function plannedPath(state: GameState, cycle: Cycle, cutoff: number): number[] {
  // Replays the same rule on a virtual snake until it reaches the apple.
  const path: number[] = [];
  let virtual: GameState = state;
  const n = cycle.order.length;
  for (let i = 0; i < n && virtual.food !== -1; i++) {
    const cell = choose(virtual, cycle, cutoff);
    path.push(cell);
    if (cell === state.food) break;
    virtual = { ...virtual, snake: [cell, ...virtual.snake.slice(0, -1)] };
  }
  return path;
}

/**
 * `cutoff` is the snake length, as a fraction of the board, up to which
 * shortcuts are allowed. 0 means never (pure cycle), 1 means always.
 */
export function makeCycleStrategy(
  id: 'cycle' | 'hamiltonian',
  label: string,
  cutoff: number,
): Strategy {
  return {
    id,
    label,
    decide(state: GameState, wantPath = false): Decision {
      const cycles = cyclesFor(state.config);
      const cycle = cycles?.find((c) => bodyFollowsCycle(c, state.snake));
      // No cycle (odd x odd board) or the body is out of cycle order, which
      // happens when the autopilot takes over mid-game. Safe A* keeps the
      // snake alive until it happens to line up with the cycle again.
      if (!cycle) return { ...safe.decide(state, wantPath), reason: 'fallback' };
      const head = state.snake[0] ?? 0;
      const cell = choose(state, cycle, cutoff);
      const dir = directionBetween(state.config, head, cell) ?? state.dir;
      const path = wantPath ? plannedPath(state, cycle, cutoff) : [cell];
      const isShortcut = ahead(cycle, head, cell) > 1;
      return { dir, path, reason: isShortcut ? 'shortcut' : 'cycle' };
    },
  };
}

/** Follows the cycle strictly. Can never die, but needs up to a full lap per apple. */
export const cycle = makeCycleStrategy('cycle', 'Hamiltonian cycle', 0);

/** Follows the cycle but cuts ahead whenever the invariant allows it. */
export const hamiltonian = makeCycleStrategy(
  'hamiltonian',
  'Hamiltonian + shortcuts',
  DEFAULT_SHORTCUT_CUTOFF,
);
