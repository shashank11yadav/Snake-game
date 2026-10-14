import { describe, expect, it } from 'vitest';
import {
  createGame,
  MAX_QUEUED_TURNS,
  queueTurn,
  spawnFood,
  step,
  validateConfig,
} from '../src/engine/game.ts';
import { manhattan, neighbor, toIndex, toXY } from '../src/engine/grid.ts';
import { nextRandom, normalizeSeed, randomInt } from '../src/engine/rng.ts';
import type { Direction, GameState } from '../src/engine/types.ts';
import { config, stateFrom } from './helpers.ts';

const head = (s: GameState): [number, number] => toXY(s.config.cols, s.snake[0] ?? -1);

describe('createGame', () => {
  it('starts a length-3 snake in the middle heading right, food off the snake', () => {
    const s = createGame(config(20, 20), 42);
    expect(s.snake).toHaveLength(3);
    expect(head(s)).toEqual([10, 10]);
    expect(s.dir).toBe('right');
    expect(s.status).toBe('playing');
    expect(s.snake).not.toContain(s.food);
    expect(s.food).toBeGreaterThanOrEqual(0);
  });

  it('rejects boards that are too small or a snake that does not fit', () => {
    expect(() => {
      validateConfig(config(3, 10));
    }).toThrow(RangeError);
    expect(() => {
      validateConfig({ ...config(6, 6), initialLength: 5 });
    }).toThrow(RangeError);
    expect(() => {
      validateConfig({ ...config(6, 6), cols: 6.5 });
    }).toThrow(RangeError);
  });
});

describe('movement and growth', () => {
  it('moves one cell per tick without growing', () => {
    const s0 = stateFrom(
      config(10, 10),
      [
        [5, 5],
        [4, 5],
        [3, 5],
      ],
      'right',
      [0, 0],
    );
    const s1 = step(s0);
    expect(head(s1)).toEqual([6, 5]);
    expect(s1.snake).toHaveLength(3);
    expect(s1.ticks).toBe(1);
    expect(s1.score).toBe(0);
  });

  it('grows by one and scores when eating, then places new food off the snake', () => {
    const s0 = stateFrom(
      config(10, 10),
      [
        [5, 5],
        [4, 5],
        [3, 5],
      ],
      'right',
      [6, 5],
    );
    const s1 = step(s0);
    expect(s1.snake).toHaveLength(4);
    expect(s1.score).toBe(1);
    expect(s1.snake).not.toContain(s1.food);
    expect(s1.seed).not.toBe(s0.seed);
  });

  it('does not mutate the previous state', () => {
    const s0 = stateFrom(
      config(10, 10),
      [
        [5, 5],
        [4, 5],
        [3, 5],
      ],
      'right',
      [6, 5],
    );
    const frozen = JSON.stringify(s0);
    step(queueTurn(s0, 'up'));
    expect(JSON.stringify(s0)).toBe(frozen);
  });

  it('ignores steps after the game is over', () => {
    const dead = { ...createGame(config(10, 10)), status: 'dead' as const };
    expect(step(dead)).toBe(dead);
  });
});

describe('collisions', () => {
  it('dies on the wall in walls mode', () => {
    const s = step(
      stateFrom(
        config(10, 10),
        [
          [9, 5],
          [8, 5],
          [7, 5],
        ],
        'right',
        [0, 0],
      ),
    );
    expect(s.status).toBe('dead');
    expect(s.deathCause).toBe('wall');
    // The body stays where it was so the renderer can show the crash.
    expect(head(s)).toEqual([9, 5]);
  });

  it('wraps to the opposite edge in wrap mode, on both axes', () => {
    const right = step(
      stateFrom(
        config(10, 8, 'wrap'),
        [
          [9, 5],
          [8, 5],
          [7, 5],
        ],
        'right',
        [0, 0],
      ),
    );
    expect(right.status).toBe('playing');
    expect(head(right)).toEqual([0, 5]);
    const up = step(
      stateFrom(
        config(10, 8, 'wrap'),
        [
          [3, 0],
          [3, 1],
          [3, 2],
        ],
        'up',
        [0, 0],
      ),
    );
    expect(head(up)).toEqual([3, 7]);
    const left = step(
      stateFrom(
        config(10, 8, 'wrap'),
        [
          [0, 2],
          [1, 2],
          [2, 2],
        ],
        'left',
        [5, 5],
      ),
    );
    expect(head(left)).toEqual([9, 2]);
    const down = step(
      stateFrom(
        config(10, 8, 'wrap'),
        [
          [4, 7],
          [4, 6],
          [4, 5],
        ],
        'down',
        [5, 5],
      ),
    );
    expect(head(down)).toEqual([4, 0]);
  });

  it('dies when running into its own body', () => {
    // A hook shape: turning down runs into the body.
    const body = [
      [5, 5],
      [5, 4],
      [6, 4],
      [6, 5],
      [6, 6],
      [5, 6],
      [4, 6],
    ] as const;
    const s = step(stateFrom(config(10, 10), body, 'up', [0, 0]), 'right');
    expect(s.status).toBe('dead');
    expect(s.deathCause).toBe('self');
  });

  it('may move into the cell the tail is leaving', () => {
    // A 2x2 loop: the head steps onto the tail as the tail moves on.
    const s = step(
      stateFrom(
        config(6, 6),
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 2],
        ],
        'left',
        [5, 5],
      ),
      'down',
    );
    expect(s.status).toBe('playing');
    expect(head(s)).toEqual([1, 2]);
  });

  it('wins when the last free cell is eaten', () => {
    const cfg = config(4, 4);
    // A serpentine covering every cell except (0,0), head at (1,0) facing left.
    const path: [number, number][] = [
      [1, 0],
      [2, 0],
      [3, 0],
      [3, 1],
      [2, 1],
      [1, 1],
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
      [3, 3],
      [2, 3],
      [1, 3],
      [0, 3],
    ];
    const s = step(stateFrom(cfg, path, 'left', [0, 0]));
    expect(s.status).toBe('won');
    expect(s.food).toBe(-1);
    expect(s.snake).toHaveLength(16);
    expect(s.score).toBe(1);
  });
});

describe('input queue', () => {
  const start = (): GameState =>
    stateFrom(
      config(10, 10),
      [
        [5, 5],
        [4, 5],
        [3, 5],
      ],
      'right',
      [0, 0],
    );

  it('blocks a direct 180 degree reversal', () => {
    const s = start();
    expect(queueTurn(s, 'left')).toBe(s);
    expect(head(step(s, 'left'))).toEqual([6, 5]);
  });

  it('ignores a turn in the current direction', () => {
    const s = start();
    expect(queueTurn(s, 'right')).toBe(s);
  });

  it('buffers two turns and applies one per tick', () => {
    let s = queueTurn(queueTurn(start(), 'up'), 'left');
    expect(s.queue).toEqual(['up', 'left']);
    s = step(s);
    expect(head(s)).toEqual([5, 4]);
    expect(s.dir).toBe('up');
    s = step(s);
    expect(head(s)).toEqual([4, 4]);
    expect(s.dir).toBe('left');
    expect(s.queue).toEqual([]);
  });

  it(`drops turns beyond ${MAX_QUEUED_TURNS}`, () => {
    const s = queueTurn(queueTurn(queueTurn(start(), 'up'), 'left'), 'down');
    expect(s.queue).toEqual(['up', 'left']);
  });

  it('checks reversal against the last queued turn, not the current heading', () => {
    // Heading right, queue up: "down" would reverse the queued "up".
    const s = queueTurn(queueTurn(start(), 'up'), 'down');
    expect(s.queue).toEqual(['up']);
    // "left" is a reversal of the current heading but fine after "up".
    expect(queueTurn(queueTurn(start(), 'up'), 'left').queue).toEqual(['up', 'left']);
  });

  it('a direct input overrides and clears the queue', () => {
    const s = step(queueTurn(start(), 'up'), 'down');
    expect(head(s)).toEqual([5, 6]);
    expect(s.queue).toEqual([]);
  });

  it('ignores input once the game is over', () => {
    const dead = { ...start(), status: 'dead' as const };
    expect(queueTurn(dead, 'up')).toBe(dead);
  });
});

describe('food placement', () => {
  it('never lands on the snake, across many random bodies and seeds', () => {
    const cells = 36;
    let seed = 7;
    for (let trial = 0; trial < 2000; trial++) {
      let r: number;
      [r, seed] = randomInt(seed, cells);
      const occupied = new Set<number>();
      const size = 1 + (r % (cells - 1));
      while (occupied.size < size) {
        [r, seed] = randomInt(seed, cells);
        occupied.add(r);
      }
      const [food] = spawnFood(cells, [...occupied], trial + 1);
      expect(food).toBeGreaterThanOrEqual(0);
      expect(occupied.has(food)).toBe(false);
    }
  });

  it('returns -1 when the board is full', () => {
    const all = Array.from({ length: 16 }, (_, i) => i);
    expect(spawnFood(16, all, 1)[0]).toBe(-1);
  });

  it('is uniform over the free cells (chi-square, p = 0.001)', () => {
    // 5x5 board, 4 cells taken, so 21 free cells and 20 degrees of freedom.
    const occupied = [0, 6, 12, 18];
    const free = 25 - occupied.length;
    const draws = 21_000;
    const counts = new Map<number, number>();
    let seed = 12345;
    for (let i = 0; i < draws; i++) {
      let food: number;
      [food, seed] = spawnFood(25, occupied, seed);
      counts.set(food, (counts.get(food) ?? 0) + 1);
    }
    expect(counts.size).toBe(free);
    for (const cell of occupied) expect(counts.has(cell)).toBe(false);
    const expected = draws / free;
    let chi2 = 0;
    for (const c of counts.values()) chi2 += (c - expected) ** 2 / expected;
    // Critical value of chi-square with 20 degrees of freedom at p = 0.001.
    expect(chi2).toBeLessThan(45.315);
  });
});

describe('determinism', () => {
  const inputs: (Direction | undefined)[] = ['up', undefined, 'left', undefined, 'down', 'right'];

  const play = (seed: number): GameState[] => {
    let s = createGame(config(12, 12), seed);
    const states = [s];
    for (let i = 0; i < 300 && s.status === 'playing'; i++) {
      const dir = inputs[i % inputs.length];
      s = step(dir ? queueTurn(s, dir) : s);
      states.push(s);
    }
    return states;
  };

  it('replays identically from the same seed and inputs', () => {
    expect(play(99)).toEqual(play(99));
  });

  it('places food differently for different seeds', () => {
    const foods = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => createGame(config(12, 12), seed).food),
    );
    expect(foods.size).toBeGreaterThan(4);
  });
});

describe('grid and rng helpers', () => {
  it('neighbor returns -1 off the board only in walls mode', () => {
    expect(neighbor(config(5, 5), toIndex(5, 0, 0), 'up')).toBe(-1);
    expect(neighbor(config(5, 5, 'wrap'), toIndex(5, 0, 0), 'up')).toBe(toIndex(5, 0, 4));
  });

  it('manhattan uses the shorter way round in wrap mode', () => {
    expect(manhattan(config(10, 10), toIndex(10, 0, 0), toIndex(10, 9, 9))).toBe(18);
    expect(manhattan(config(10, 10, 'wrap'), toIndex(10, 0, 0), toIndex(10, 9, 9))).toBe(2);
  });

  it('rng stays in [0, 1) and normalizeSeed handles junk', () => {
    let seed = 0;
    for (let i = 0; i < 10_000; i++) {
      let v: number;
      [v, seed] = nextRandom(seed);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(normalizeSeed(Number.NaN)).toBe(0);
    expect(normalizeSeed(-1)).toBe(4294967295);
    expect(normalizeSeed(3.9)).toBe(3);
  });
});
