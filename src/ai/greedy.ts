import { directionBetween } from '../engine/grid.ts';
import type { GameState } from '../engine/types.ts';
import { legalMoves } from './moves.ts';
import { aStar, bodyGrid } from './search.ts';
import type { Decision, Strategy } from './types.ts';

/**
 * Baseline: shortest path to the apple, no look-ahead. When the apple is
 * unreachable it takes any move that survives this tick. It is quick to eat
 * early on and walks into dead ends once the snake is long.
 */
export const greedy: Strategy = {
  id: 'greedy',
  label: 'Greedy A*',
  decide(state: GameState): Decision {
    const { config, snake, food } = state;
    const head = snake[0] ?? 0;
    if (food !== -1) {
      const path = aStar(config, bodyGrid(config, snake, true), head, food);
      const first = path?.[0];
      if (path && first !== undefined) {
        const dir = directionBetween(config, head, first);
        if (dir) return { dir, path, reason: 'food' };
      }
    }
    const move = legalMoves(state)[0];
    if (move) return { dir: move.dir, path: [move.cell], reason: 'any' };
    return { dir: state.dir, path: [], reason: 'stuck' };
  },
};
