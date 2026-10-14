import { describe, expect, it } from 'vitest';
import { STRATEGIES, STRATEGY_IDS, isStrategyId } from '../src/ai/index.ts';
import {
  bodyFollowsCycle,
  buildCycle,
  cyclesFor,
  makeCycleStrategy,
} from '../src/ai/hamiltonian.ts';
import { legalMoves, simulatePath } from '../src/ai/moves.ts';
import { tailReachable } from '../src/ai/safe.ts';
import { aStar, bfsDistances, bfsPath, bodyGrid } from '../src/ai/search.ts';
import { runGame } from '../src/ai/simulate.ts';
import { createGame, step } from '../src/engine/game.ts';
import { manhattan, OPPOSITE, toIndex } from '../src/engine/grid.ts';
import type { GameState } from '../src/engine/types.ts';
import { config, stateFrom } from './helpers.ts';

const { greedy, safe, cycle, hamiltonian } = STRATEGIES;

describe('path search', () => {
  it('A* and BFS agree on shortest path length around obstacles', () => {
    const cfg = config(8, 8);
    const grid = new Uint8Array(64);
    // A wall down column 4 with a gap at the bottom.
    for (let y = 0; y < 7; y++) grid[toIndex(8, 4, y)] = 1;
    const start = toIndex(8, 0, 0);
    const goal = toIndex(8, 7, 0);
    const a = aStar(cfg, grid, start, goal);
    const b = bfsPath(cfg, grid, start, goal);
    const d = bfsDistances(cfg, grid, start)[goal];
    expect(a).not.toBeNull();
    expect(a).toHaveLength(d ?? -1);
    expect(b).toHaveLength(d ?? -1);
    for (const cell of a ?? []) expect(grid[cell]).toBe(0);
  });

  it('uses wrap edges as shortcuts in wrap mode', () => {
    const cfg = config(10, 10, 'wrap');
    const path = aStar(cfg, new Uint8Array(100), toIndex(10, 0, 5), toIndex(10, 9, 5));
    expect(path).toEqual([toIndex(10, 9, 5)]);
  });

  it('returns null when the goal is walled off', () => {
    const cfg = config(6, 6);
    const grid = new Uint8Array(36);
    for (let y = 0; y < 6; y++) grid[toIndex(6, 3, y)] = 1;
    expect(aStar(cfg, grid, toIndex(6, 0, 0), toIndex(6, 5, 5))).toBeNull();
    expect(bfsPath(cfg, grid, toIndex(6, 0, 0), toIndex(6, 5, 5))).toBeNull();
  });
});

describe('Hamiltonian cycle construction', () => {
  const isHamiltonian = (cols: number, rows: number): boolean => {
    const c = buildCycle(cols, rows);
    if (!c) return false;
    const n = cols * rows;
    if (new Set(c.order).size !== n) return false;
    const cfg = config(cols, rows);
    for (let i = 0; i < n; i++) {
      if (manhattan(cfg, c.order[i] ?? 0, c.order[(i + 1) % n] ?? 0) !== 1) return false;
      if (c.pos[c.order[i] ?? 0] !== i) return false;
    }
    return true;
  };

  it.each([
    [4, 4],
    [10, 10],
    [20, 20],
    [6, 4],
    [5, 4],
    [4, 5],
    [7, 10],
    [16, 9],
  ])('builds a valid cycle on %ix%i', (cols, rows) => {
    expect(isHamiltonian(cols, rows)).toBe(true);
  });

  it('reports that odd x odd boards have no cycle', () => {
    expect(buildCycle(5, 5)).toBeNull();
    expect(buildCycle(9, 7)).toBeNull();
  });
});

describe('strategy contract', () => {
  it('every strategy is registered and validated by id', () => {
    for (const id of STRATEGY_IDS) expect(STRATEGIES[id].id).toBe(id);
    expect(isStrategyId('safe')).toBe(true);
    expect(isStrategyId('toString')).toBe(false);
    expect(isStrategyId(3)).toBe(false);
  });

  it('never asks for a 180 degree reversal', () => {
    for (const id of STRATEGY_IDS) {
      let s = createGame(config(10, 10), 3);
      for (let i = 0; i < 200 && s.status === 'playing'; i++) {
        const { dir } = STRATEGIES[id].decide(s, true);
        expect(dir).not.toBe(OPPOSITE[s.dir]);
        s = step(s, dir);
      }
    }
  });

  it('returns a planned path that starts next to the head', () => {
    const s = createGame(config(10, 10), 5);
    for (const id of STRATEGY_IDS) {
      const { path } = STRATEGIES[id].decide(s, true);
      expect(path.length).toBeGreaterThan(0);
      expect(manhattan(s.config, s.snake[0] ?? 0, path[0] ?? 0)).toBe(1);
    }
  });
});

describe('Hamiltonian strategies', () => {
  it('with shortcuts: never dies and fills a 10x10 board on 100 seeds', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const r = runGame(hamiltonian, config(10, 10), seed);
      expect(r.outcome, `seed ${seed}`).toBe('won');
      expect(r.finalLength).toBe(100);
    }
  });

  it('with shortcuts: fills wrap-mode and rectangular boards too', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(runGame(hamiltonian, config(10, 10, 'wrap'), seed).outcome).toBe('won');
      expect(runGame(hamiltonian, config(8, 6), seed).outcome).toBe('won');
      expect(runGame(hamiltonian, config(7, 10), seed).outcome).toBe('won');
    }
  });

  it('with shortcuts: fills a 20x20 board', () => {
    for (let seed = 1; seed <= 3; seed++) {
      expect(runGame(hamiltonian, config(20, 20), seed).outcome).toBe('won');
    }
  });

  it('keeps the body in cycle order on every single move', () => {
    const [forward, backward] = cyclesFor(config(10, 10)) ?? [];
    let s = createGame(config(10, 10), 11);
    while (s.status === 'playing') {
      const ok = [forward, backward].some((c) => c && bodyFollowsCycle(c, s.snake));
      expect(ok).toBe(true);
      s = step(s, hamiltonian.decide(s).dir);
    }
    expect(s.status).toBe('won');
  });

  it('even with shortcuts allowed at every length it never dies', () => {
    const always = makeCycleStrategy('hamiltonian', 'always', 1);
    for (let seed = 1; seed <= 30; seed++) {
      expect(runGame(always, config(10, 10), seed).outcome).toBe('won');
    }
  });

  it('shortcuts need fewer moves than the plain cycle', () => {
    let plain = 0;
    let cut = 0;
    for (let seed = 1; seed <= 20; seed++) {
      plain += runGame(cycle, config(10, 10), seed).moves;
      cut += runGame(hamiltonian, config(10, 10), seed).moves;
    }
    expect(cut).toBeLessThan(plain * 0.75);
  });

  it('plain cycle also fills the board', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(runGame(cycle, config(10, 10), seed).outcome).toBe('won');
    }
  });

  it('falls back to Safe A* when no cycle exists or the body is out of order', () => {
    const odd = createGame(config(5, 5), 1);
    expect(hamiltonian.decide(odd).reason).toBe('fallback');
    // An S shape: row 6 runs with the forward cycle, row 4 against it, so
    // neither direction of the cycle matches the body.
    const scrambled = stateFrom(
      config(10, 10),
      [
        [3, 4],
        [4, 4],
        [5, 4],
        [5, 5],
        [5, 6],
        [4, 6],
        [3, 6],
      ],
      'left',
      [0, 0],
    );
    expect(hamiltonian.decide(scrambled).reason).toBe('fallback');
    expect(legalMoves(scrambled).map((m) => m.dir)).toContain(hamiltonian.decide(scrambled).dir);
  });
});

describe('Safe A*', () => {
  // Food sits at the end of a one-wide dead end (column 0). The shortest path
  // walks in, eats, and leaves the head boxed in by its own body.
  const trap = (): GameState =>
    stateFrom(
      config(6, 6),
      [
        [0, 4],
        [1, 4],
        [1, 3],
        [1, 2],
        [1, 1],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
        [5, 0],
      ],
      'left',
      [0, 0],
    );

  it('greedy walks into the dead end and dies', () => {
    let s = trap();
    expect(greedy.decide(s).dir).toBe('up');
    for (let i = 0; i < 20 && s.status === 'playing'; i++) s = step(s, greedy.decide(s).dir);
    expect(s.status).toBe('dead');
  });

  it('refuses the trap and survives', () => {
    let s = trap();
    const first = safe.decide(s);
    expect(first.dir).not.toBe('up');
    expect(first.reason).toBe('tail');
    for (let i = 0; i < 500 && s.status === 'playing'; i++) s = step(s, safe.decide(s).dir);
    expect(s.status).not.toBe('dead');
  });

  it('chases its tail when the apple is unreachable', () => {
    // The apple is sealed inside a ring of body cells.
    const s = stateFrom(
      config(6, 6),
      [
        [0, 5],
        [0, 4],
        [1, 4],
        [2, 4],
        [3, 4],
        [3, 3],
        [3, 2],
        [2, 2],
        [1, 2],
        [1, 3],
      ],
      'down',
      [2, 3],
    );
    const d = safe.decide(s);
    expect(['tail', 'food']).toContain(d.reason);
    expect(legalMoves(s).map((m) => m.dir)).toContain(d.dir);
  });

  it('only commits to moves that leave the head a way back to the tail', () => {
    let checked = 0;
    for (let seed = 1; seed <= 15; seed++) {
      let s = createGame(config(8, 8), seed);
      for (let i = 0; i < 3000 && s.status === 'playing'; i++) {
        const d = safe.decide(s, true);
        if (d.reason === 'food') {
          // The snake that finishes the planned path must not be boxed in.
          expect(tailReachable(s.config, simulatePath(s.snake, d.path, s.food))).toBe(true);
          checked++;
        }
        const before = s;
        s = step(s, d.dir);
        if (d.reason === 'tail') {
          expect(s.status).not.toBe('dead');
          expect(tailReachable(s.config, s.snake), `seed ${seed} tick ${before.ticks}`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('never dies on 10x10 over 40 seeds and scores far above greedy', () => {
    let safeTotal = 0;
    let greedyTotal = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = runGame(safe, config(10, 10), seed);
      expect(r.outcome, `seed ${seed}`).not.toBe('dead');
      safeTotal += r.score;
      greedyTotal += runGame(greedy, config(10, 10), seed).score;
    }
    expect(safeTotal).toBeGreaterThan(greedyTotal * 2);
  });
});

describe('tailReachable', () => {
  it('detects a sealed head', () => {
    const cfg = config(6, 6);
    const sealed = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [2, 0],
      [3, 0],
    ].map(([x, y]) => toIndex(6, x ?? 0, y ?? 0));
    // Head (0,0) is boxed in by (0,1) and (1,0), neither of which is the tail.
    expect(tailReachable(cfg, sealed)).toBe(false);
    expect(bodyGrid(cfg, sealed, true)[toIndex(6, 3, 0)]).toBe(0);
  });
});
