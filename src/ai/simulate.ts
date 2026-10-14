import { createGame, step } from '../engine/game.ts';
import type { GameConfig, GameState } from '../engine/types.ts';
import type { Strategy } from './types.ts';

export type Outcome = 'won' | 'dead' | 'stalled';

export interface RunResult {
  readonly outcome: Outcome;
  readonly score: number;
  readonly moves: number;
  readonly finalLength: number;
  readonly state: GameState;
}

/**
 * Plays one full game with no DOM. A strategy can loop forever without dying
 * (Safe A* chasing its tail), so a game also ends if no apple is eaten within
 * `stallLimit` moves. The default of four laps of the board is well above the
 * one lap the plain cycle can need.
 */
export function runGame(
  strategy: Strategy,
  config: GameConfig,
  seed: number,
  stallLimit = config.cols * config.rows * 4,
): RunResult {
  let state = createGame(config, seed);
  let sinceApple = 0;
  while (state.status === 'playing' && sinceApple < stallLimit) {
    const before = state.score;
    state = step(state, strategy.decide(state).dir);
    sinceApple = state.score > before ? 0 : sinceApple + 1;
  }
  const outcome: Outcome = state.status === 'playing' ? 'stalled' : state.status;
  return {
    outcome,
    score: state.score,
    moves: state.ticks,
    finalLength: state.snake.length,
    state,
  };
}
