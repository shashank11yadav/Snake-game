import { cycle, hamiltonian } from './hamiltonian.ts';
import { greedy } from './greedy.ts';
import { safe } from './safe.ts';
import type { Strategy, StrategyId } from './types.ts';

export type { Decision, Strategy, StrategyId } from './types.ts';

export const STRATEGIES: Readonly<Record<StrategyId, Strategy>> = {
  greedy,
  safe,
  cycle,
  hamiltonian,
};

export const STRATEGY_IDS = Object.keys(STRATEGIES) as StrategyId[];

export function isStrategyId(value: unknown): value is StrategyId {
  return typeof value === 'string' && Object.hasOwn(STRATEGIES, value);
}
