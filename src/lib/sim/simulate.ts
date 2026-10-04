import { percentileSorted, returnStats, type ReturnStats } from './stats';

export type RebalanceFrequency = 'none' | 'monthly' | 'quarterly' | 'annually';

const REBALANCE_MONTHS: Record<RebalanceFrequency, number> = {
  none: 0,
  monthly: 1,
  quarterly: 3,
  annually: 12,
};

export interface PathOptions {
  initial: number;
  /** Added at the end of every month, split by target weight. */
  monthlyContribution?: number;
  rebalance?: RebalanceFrequency;
  /** Annual yield on the unallocated (cash) slice, e.g. 0.04. */
  cashRate?: number;
}

export interface PathResult {
  /** Portfolio value at the start (index 0) and after each month. */
  values: Float64Array;
  /** Time-weighted monthly returns (contributions removed). */
  returns: Float64Array;
  contributed: number;
}

/**
 * Walk a portfolio forward through monthly return rows.
 * Weights drift with the market between rebalances, the way a real account would.
 */
export function runPath(rows: ArrayLike<ArrayLike<number>>, weights: number[], opts: PathOptions): PathResult {
  const n = weights.length;
  const contribution = opts.monthlyContribution ?? 0;
  const period = REBALANCE_MONTHS[opts.rebalance ?? 'annually'];
  const cashGrowth = (1 + (opts.cashRate ?? 0)) ** (1 / 12);
  const cashWeight = Math.max(0, 1 - weights.reduce((a, b) => a + b, 0));

  const amounts = weights.map((w) => opts.initial * w);
  let cash = opts.initial * cashWeight;

  const values = new Float64Array(rows.length + 1);
  const returns = new Float64Array(rows.length);
  values[0] = opts.initial;
  let contributed = opts.initial;

  for (let t = 0; t < rows.length; t++) {
    const row = rows[t];
    let total = 0;
    for (let i = 0; i < n; i++) {
      amounts[i] *= 1 + row[i];
      total += amounts[i];
    }
    cash *= cashGrowth;
    total += cash;
    returns[t] = values[t] > 0 ? total / values[t] - 1 : 0;

    if (contribution) {
      for (let i = 0; i < n; i++) amounts[i] += contribution * weights[i];
      cash += contribution * cashWeight;
      total += contribution;
      contributed += contribution;
    }

    if (period && (t + 1) % period === 0) {
      for (let i = 0; i < n; i++) amounts[i] = total * weights[i];
      cash = total * cashWeight;
    }
    values[t + 1] = total;
  }
  return { values, returns, contributed };
}

export interface BacktestResult {
  months: string[];
  values: number[];
  contributed: number;
  stats: ReturnStats;
}

/** Replay history: how would this allocation have done over the given months? */
export function backtest(
  aligned: { months: string[]; returns: number[][] },
  weights: number[],
  opts: PathOptions & { riskFreeRate?: number },
): BacktestResult {
  const path = runPath(aligned.returns, weights, opts);
  const startMonth = aligned.months.length ? previousMonth(aligned.months[0]) : '';
  return {
    months: [startMonth, ...aligned.months],
    values: Array.from(path.values),
    contributed: path.contributed,
    stats: returnStats(Array.from(path.returns), opts.riskFreeRate ?? 0),
  };
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export interface ProjectionOptions extends PathOptions {
  years: number;
  paths?: number;
  /** Length of the historical chunks stitched together, in months. Longer keeps more of history's streakiness. */
  blockMonths?: number;
  /** Added to every asset's annual return; negative values make the projection more conservative. */
  annualReturnAdjustment?: number;
  /** When set, results are shown in today's dollars. */
  inflation?: number;
  seed?: number;
}

export interface ProjectionPoint {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  contributed: number;
}

export interface ProjectionResult {
  points: ProjectionPoint[];
  finalValues: Float64Array;
  /** Share of paths that end with less than the total amount put in (after inflation, when `inflation` is set). */
  probabilityOfLoss: number;
  /** Median annualized time-weighted return across paths. */
  medianCagr: number;
}

/**
 * Monte Carlo projection by block bootstrap: build each possible future by stitching together
 * randomly chosen stretches of real history. All assets in a stretch come from the same months,
 * so the way they moved together (correlation) is preserved without assuming a bell curve.
 */
export function project(history: number[][], weights: number[], opts: ProjectionOptions): ProjectionResult {
  if (history.length < 12) throw new Error('At least 12 months of shared history are needed to project.');
  const months = Math.round(opts.years * 12);
  const pathCount = opts.paths ?? 2000;
  const block = Math.max(1, Math.min(opts.blockMonths ?? 12, history.length));
  const shift = (1 + (opts.annualReturnAdjustment ?? 0)) ** (1 / 12) - 1;
  const deflate = (1 + (opts.inflation ?? 0)) ** (1 / 12);
  const rand = mulberry32(opts.seed ?? 42);

  const shifted = shift ? history.map((row) => row.map((r) => r + shift)) : history;
  const byYear: Float64Array[] = Array.from({ length: opts.years + 1 }, () => new Float64Array(pathCount));
  const finalValues = new Float64Array(pathCount);
  const cagrs = new Float64Array(pathCount);
  const rows: number[][] = new Array(months);

  let contributedTotal = opts.initial;
  for (let p = 0; p < pathCount; p++) {
    for (let t = 0; t < months; ) {
      const start = Math.floor(rand() * history.length);
      for (let k = 0; k < block && t < months; k++, t++) rows[t] = shifted[(start + k) % history.length];
    }
    const path = runPath(rows, weights, opts);
    contributedTotal = path.contributed;
    for (let y = 0; y <= opts.years; y++) {
      const m = Math.min(y * 12, months);
      byYear[y][p] = path.values[m] / deflate ** m;
    }
    finalValues[p] = path.values[months] / deflate ** months;
    let growth = 1;
    for (const r of path.returns) growth *= 1 + r;
    cagrs[p] = growth ** (12 / months) - 1;
  }

  const contribution = opts.monthlyContribution ?? 0;
  const points = byYear.map((vals, year) => {
    const sorted = vals.slice().sort();
    return {
      year,
      p10: percentileSorted(sorted, 0.1),
      p25: percentileSorted(sorted, 0.25),
      p50: percentileSorted(sorted, 0.5),
      p75: percentileSorted(sorted, 0.75),
      p90: percentileSorted(sorted, 0.9),
      contributed: opts.initial + contribution * Math.min(year * 12, months),
    };
  });

  let losses = 0;
  for (let p = 0; p < pathCount; p++) {
    // With inflation set this asks "did it lose purchasing power?", matching what the chart shows.
    if (finalValues[p] < contributedTotal) losses++;
  }

  return {
    points,
    finalValues,
    probabilityOfLoss: losses / pathCount,
    medianCagr: percentileSorted(cagrs.slice().sort(), 0.5),
  };
}

/** Small, fast, seedable PRNG so projections are repeatable. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
