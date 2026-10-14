import type { Direction, GameState } from '../engine/types.ts';

export interface Decision {
  readonly dir: Direction;
  /** Cells the strategy currently intends to walk through, for the overlay. */
  readonly path: readonly number[];
  /** Short label of the branch taken, shown in the UI and counted by the benchmark. */
  readonly reason: string;
}

export type StrategyId = 'greedy' | 'safe' | 'cycle' | 'hamiltonian';

export interface Strategy {
  readonly id: StrategyId;
  readonly label: string;
  /** `wantPath` lets the benchmark skip work that only the overlay needs. */
  decide(state: GameState, wantPath?: boolean): Decision;
}
