import { DIRECTIONS, neighbor } from '../engine/grid.ts';
import type { Direction, GameState } from '../engine/types.ts';

export interface Move {
  readonly dir: Direction;
  readonly cell: number;
}

/** Moves that do not die on this tick: on the board and not into the body. */
export function legalMoves(state: GameState): Move[] {
  const { config, snake, food } = state;
  const head = snake[0] ?? 0;
  const moves: Move[] = [];
  for (const dir of DIRECTIONS) {
    const cell = neighbor(config, head, dir);
    if (cell === -1) continue;
    const blocking = cell === food ? snake.length : snake.length - 1;
    let hit = false;
    for (let i = 0; i < blocking; i++) {
      if (snake[i] === cell) {
        hit = true;
        break;
      }
    }
    if (!hit) moves.push({ dir, cell });
  }
  return moves;
}

/**
 * The body after walking `path`, growing by one if the last cell is food.
 * Food appearing mid-path is not modelled because paths are planned to the
 * current food and end there.
 */
export function simulatePath(
  snake: readonly number[],
  path: readonly number[],
  food: number,
): number[] {
  const body = [...snake];
  for (const cell of path) {
    body.unshift(cell);
    if (cell !== food) body.pop();
  }
  return body;
}
