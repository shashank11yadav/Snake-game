import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { STRATEGIES, STRATEGY_IDS, isStrategyId } from '../src/ai/index.ts';
import type { StrategyId } from '../src/ai/index.ts';
import { makeCycleStrategy } from '../src/ai/hamiltonian.ts';
import { runGame } from '../src/ai/simulate.ts';
import type { GameConfig, Mode } from '../src/engine/types.ts';

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '100' },
    size: { type: 'string', default: '10' },
    mode: { type: 'string', default: 'walls' },
    seed: { type: 'string', default: '1' },
    strategies: { type: 'string', default: STRATEGY_IDS.join(',') },
    sweep: { type: 'boolean', default: false },
  },
});

const games = Number(values.games);
const size = Number(values.size);
const firstSeed = Number(values.seed);
const mode: Mode = values.mode === 'wrap' ? 'wrap' : 'walls';
const ids = values.strategies.split(',').filter(isStrategyId);
if (
  !Number.isInteger(games) ||
  games < 1 ||
  !Number.isInteger(size) ||
  size < 4 ||
  ids.length === 0
) {
  console.error(
    'usage: npm run bench -- --games 100 --size 10 [--mode walls|wrap] [--seed 1] [--strategies greedy,safe]',
  );
  process.exit(1);
}

const config: GameConfig = { cols: size, rows: size, mode, initialLength: 3 };
const maxScore = size * size - config.initialLength;

interface Row {
  id: StrategyId;
  avgScore: number;
  medianScore: number;
  winRate: number;
  deaths: number;
  stalls: number;
  movesPerApple: number;
  usPerMove: number;
}

if (values.sweep) {
  // Ablation for the shortcut cutoff used by the Hamiltonian strategy.
  console.log(`\nShortcut cutoff sweep, ${games} games, ${size}x${size}, ${mode} mode.\n`);
  console.log('| Shortcuts allowed while snake is under | Board filled | Moves per apple |');
  console.log('| --- | ---: | ---: |');
  for (const cutoff of [0, 0.25, 0.4, 0.5, 0.6, 0.75, 1]) {
    const strategy = makeCycleStrategy('hamiltonian', `cutoff ${cutoff}`, cutoff);
    let wins = 0;
    let moves = 0;
    let apples = 0;
    for (let i = 0; i < games; i++) {
      const r = runGame(strategy, config, firstSeed + i);
      if (r.outcome === 'won') wins++;
      moves += r.moves;
      apples += r.score;
    }
    console.log(
      `| ${(cutoff * 100).toFixed(0)}% of the board | ${((wins / games) * 100).toFixed(0)}% | ${(moves / apples).toFixed(1)} |`,
    );
  }
  process.exit(0);
}

const rows: Row[] = [];
for (const id of ids) {
  const strategy = STRATEGIES[id];
  const scores: number[] = [];
  let wins = 0;
  let deaths = 0;
  let stalls = 0;
  let totalMoves = 0;
  let totalApples = 0;
  const t0 = performance.now();
  for (let i = 0; i < games; i++) {
    const r = runGame(strategy, config, firstSeed + i);
    scores.push(r.score);
    totalMoves += r.moves;
    totalApples += r.score;
    if (r.outcome === 'won') wins++;
    else if (r.outcome === 'dead') deaths++;
    else stalls++;
  }
  const elapsed = performance.now() - t0;
  scores.sort((a, b) => a - b);
  rows.push({
    id,
    avgScore: scores.reduce((a, b) => a + b, 0) / games,
    medianScore: scores[Math.floor(games / 2)] ?? 0,
    winRate: wins / games,
    deaths,
    stalls,
    movesPerApple: totalApples === 0 ? 0 : totalMoves / totalApples,
    usPerMove: (elapsed * 1000) / Math.max(1, totalMoves),
  });
  process.stderr.write(`${id}: done in ${(elapsed / 1000).toFixed(1)}s\n`);
}

console.log(
  `\n${games} seeded games per strategy (seeds ${firstSeed}..${firstSeed + games - 1}), ${size}x${size} board, ${mode} mode, max score ${maxScore}. Node ${process.version}.\n`,
);
console.log(
  '| Strategy | Avg score | Median | Board filled | Died | Stalled | Moves per apple | Time per move |',
);
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const r of rows) {
  console.log(
    `| ${STRATEGIES[r.id].label} | ${r.avgScore.toFixed(1)} | ${r.medianScore} | ${(r.winRate * 100).toFixed(0)}% | ${r.deaths} | ${r.stalls} | ${r.movesPerApple.toFixed(1)} | ${r.usPerMove.toFixed(1)} µs |`,
  );
}
