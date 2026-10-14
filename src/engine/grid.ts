import type { Direction, GameConfig } from './types.ts';

export const DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left'];

export const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const DELTA: Readonly<Record<Direction, readonly [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export function toIndex(cols: number, x: number, y: number): number {
  return y * cols + x;
}

export function toXY(cols: number, index: number): [x: number, y: number] {
  return [index % cols, Math.floor(index / cols)];
}

/** Neighbouring cell in a direction, or -1 if it is off the board in walls mode. */
export function neighbor(config: GameConfig, index: number, dir: Direction): number {
  const { cols, rows } = config;
  const [x, y] = toXY(cols, index);
  const [dx, dy] = DELTA[dir];
  let nx = x + dx;
  let ny = y + dy;
  if (config.mode === 'wrap') {
    nx = (nx + cols) % cols;
    ny = (ny + rows) % rows;
  } else if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
    return -1;
  }
  return toIndex(cols, nx, ny);
}

/** Direction that moves `from` onto the adjacent cell `to`, or null if they are not adjacent. */
export function directionBetween(config: GameConfig, from: number, to: number): Direction | null {
  for (const dir of DIRECTIONS) {
    if (neighbor(config, from, dir) === to) return dir;
  }
  return null;
}

/** Shortest grid distance, accounting for wrap-around edges. */
export function manhattan(config: GameConfig, a: number, b: number): number {
  const [ax, ay] = toXY(config.cols, a);
  const [bx, by] = toXY(config.cols, b);
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (config.mode === 'wrap') {
    dx = Math.min(dx, config.cols - dx);
    dy = Math.min(dy, config.rows - dy);
  }
  return dx + dy;
}
