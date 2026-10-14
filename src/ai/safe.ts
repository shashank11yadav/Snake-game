import { directionBetween, manhattan } from '../engine/grid.ts';
import type { GameConfig, GameState } from '../engine/types.ts';
import { legalMoves, simulatePath } from './moves.ts';
import { aStar, bfsDistances, bfsPath, bodyGrid, cellCount, floodFillSize } from './search.ts';
import type { Decision, Strategy } from './types.ts';

/**
 * A body can always survive if its head can reach its tail: it can follow
 * the tail around forever and wait for the board to change. So "tail
 * reachable" is the safety test applied to every candidate move.
 */
export function tailReachable(config: GameConfig, snake: readonly number[]): boolean {
  if (snake.length >= cellCount(config)) return true;
  const head = snake[0] ?? 0;
  const tail = snake.at(-1) ?? 0;
  if (head === tail) return true;
  const dist = bfsDistances(config, bodyGrid(config, snake, true), head, tail);
  return (dist[tail] ?? -1) > 0;
}

function bodyAfterMove(state: GameState, cell: number): number[] {
  return simulatePath(state.snake, [cell], state.food);
}

/**
 * Safe A*: take the shortest path to the apple only if the snake that
 * arrives there can still reach its tail. Otherwise stall by chasing the
 * tail, preferring the move that keeps the tail farthest away (a cheap
 * stand-in for "longest safe path", which is NP-hard to compute exactly).
 * If even that fails, pick the move with the most open space.
 */
export const safe: Strategy = {
  id: 'safe',
  label: 'Safe A*',
  decide(state: GameState): Decision {
    const { config, snake, food } = state;
    const head = snake[0] ?? 0;

    if (food !== -1) {
      const path = aStar(config, bodyGrid(config, snake, true), head, food);
      const first = path?.[0];
      if (path && first !== undefined && tailReachable(config, simulatePath(snake, path, food))) {
        const dir = directionBetween(config, head, first);
        if (dir) return { dir, path, reason: 'food' };
      }
    }

    const moves = legalMoves(state);

    let best: { dir: GameState['dir']; cell: number; score: number; body: number[] } | null = null;
    for (const move of moves) {
      const body = bodyAfterMove(state, move.cell);
      if (!tailReachable(config, body)) continue;
      const tail = body.at(-1) ?? 0;
      const dist = bfsDistances(config, bodyGrid(config, body, true), move.cell, tail);
      // Ties go to the move farther from the apple. Hovering next to an apple
      // the snake cannot safely take tends to repeat the same loop; drifting
      // away lets the body uncoil. On 10x10 this raised the fill rate from
      // 43% to 60% over 30 seeds.
      const awayFromFood = food === -1 ? 0 : manhattan(config, move.cell, food);
      const score = (dist[tail] ?? 0) * 1000 + awayFromFood;
      if (!best || score > best.score) best = { ...move, score, body };
    }
    if (best) {
      const tail = best.body.at(-1) ?? 0;
      const rest = bfsPath(config, bodyGrid(config, best.body, true), best.cell, tail) ?? [];
      return { dir: best.dir, path: [best.cell, ...rest], reason: 'tail' };
    }

    let survival: { dir: GameState['dir']; cell: number; space: number } | null = null;
    for (const move of moves) {
      const space = floodFillSize(
        config,
        bodyGrid(config, bodyAfterMove(state, move.cell), true),
        move.cell,
      );
      if (!survival || space > survival.space) survival = { ...move, space };
    }
    if (survival) return { dir: survival.dir, path: [survival.cell], reason: 'space' };
    return { dir: state.dir, path: [], reason: 'stuck' };
  },
};
