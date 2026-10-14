import { DIRECTIONS, manhattan, neighbor } from '../engine/grid.ts';
import type { GameConfig } from '../engine/types.ts';

/** 1 = blocked, 0 = free. One byte per cell keeps searches allocation-light. */
export type Grid = Uint8Array;

export function cellCount(config: GameConfig): number {
  return config.cols * config.rows;
}

/**
 * Marks the body as blocked. The tail tip is left open when `freeTail` is set,
 * because it moves away on the next tick (unless the snake eats on that tick,
 * which the callers account for).
 */
export function bodyGrid(config: GameConfig, snake: readonly number[], freeTail: boolean): Grid {
  const grid = new Uint8Array(cellCount(config));
  const end = freeTail ? snake.length - 1 : snake.length;
  for (let i = 0; i < end; i++) grid[snake[i] ?? 0] = 1;
  return grid;
}

function rebuildPath(parent: Int32Array, start: number, goal: number): number[] {
  const path: number[] = [];
  for (let cur = goal; cur !== start; cur = parent[cur] ?? start) path.push(cur);
  return path.reverse();
}

/**
 * A* on a uniform-cost grid with a Manhattan (wrap-aware) heuristic. Returns
 * the cells to walk through, excluding `start` and including `goal`, or null.
 * Ties on f are broken toward larger g so the search dives toward the goal
 * instead of fanning out, which visits far fewer cells on open boards.
 */
export function aStar(
  config: GameConfig,
  grid: Grid,
  start: number,
  goal: number,
): number[] | null {
  if (start === goal) return [];
  const n = cellCount(config);
  const g = new Int32Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  // Binary heap of cells keyed by (f asc, g desc).
  const heap: number[] = [];
  const f = new Int32Array(n);
  const less = (a: number, b: number): boolean => {
    const fa = f[a] ?? 0;
    const fb = f[b] ?? 0;
    return fa !== fb ? fa < fb : (g[a] ?? 0) > (g[b] ?? 0);
  };
  const push = (cell: number): void => {
    heap.push(cell);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const hi = heap[i] ?? 0;
      const hp = heap[p] ?? 0;
      if (!less(hi, hp)) break;
      heap[i] = hp;
      heap[p] = hi;
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0] ?? -1;
    const last = heap.pop() ?? -1;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l] ?? 0, heap[m] ?? 0)) m = l;
        if (r < heap.length && less(heap[r] ?? 0, heap[m] ?? 0)) m = r;
        if (m === i) break;
        const tmp = heap[i] ?? 0;
        heap[i] = heap[m] ?? 0;
        heap[m] = tmp;
        i = m;
      }
    }
    return top;
  };

  g[start] = 0;
  f[start] = manhattan(config, start, goal);
  push(start);
  while (heap.length > 0) {
    const cur = pop();
    if (cur === goal) return rebuildPath(parent, start, goal);
    if (closed[cur] === 1) continue;
    closed[cur] = 1;
    const gNext = (g[cur] ?? 0) + 1;
    for (const dir of DIRECTIONS) {
      const nb = neighbor(config, cur, dir);
      if (nb === -1 || closed[nb] === 1) continue;
      if (grid[nb] === 1 && nb !== goal) continue;
      const known = g[nb] ?? -1;
      if (known !== -1 && known <= gNext) continue;
      g[nb] = gNext;
      parent[nb] = cur;
      f[nb] = gNext + manhattan(config, nb, goal);
      push(nb);
    }
  }
  return null;
}

/**
 * Breadth-first distances from `start` over free cells. The goal cell, if
 * given, is treated as enterable even when blocked (used for "can the head
 * reach its own tail").
 */
export function bfsDistances(config: GameConfig, grid: Grid, start: number, goal = -1): Int32Array {
  const n = cellCount(config);
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++] ?? 0;
    if (cur === goal) continue;
    const d = (dist[cur] ?? 0) + 1;
    for (const dir of DIRECTIONS) {
      const nb = neighbor(config, cur, dir);
      if (nb === -1 || dist[nb] !== -1) continue;
      if (grid[nb] === 1 && nb !== goal) continue;
      dist[nb] = d;
      queue[tail++] = nb;
    }
  }
  return dist;
}

/** Shortest path by BFS, same contract as aStar. */
export function bfsPath(
  config: GameConfig,
  grid: Grid,
  start: number,
  goal: number,
): number[] | null {
  if (start === goal) return [];
  const dist = bfsDistances(config, grid, start, goal);
  if (dist[goal] === -1) return null;
  // Walk back from the goal along strictly decreasing distances.
  const path = [goal];
  let cur = goal;
  while ((dist[cur] ?? 0) > 1) {
    for (const dir of DIRECTIONS) {
      const nb = neighbor(config, cur, dir);
      if (nb !== -1 && dist[nb] === (dist[cur] ?? 0) - 1 && (grid[nb] === 0 || nb === start)) {
        cur = nb;
        break;
      }
    }
    path.push(cur);
  }
  return path.reverse();
}

/** Number of cells reachable from `start` (start included). */
export function floodFillSize(config: GameConfig, grid: Grid, start: number): number {
  const dist = bfsDistances(config, grid, start);
  let count = 0;
  for (const d of dist) if (d !== -1) count++;
  return count;
}
