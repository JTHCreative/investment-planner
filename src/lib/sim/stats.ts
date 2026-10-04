export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function correlation(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Linear-interpolated percentile of an ascending-sorted array. p in [0, 1]. */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface ReturnStats {
  /** Compound annual growth rate. */
  cagr: number;
  /** Annualized standard deviation of monthly returns. */
  volatility: number;
  /** Largest peak-to-trough decline, as a negative fraction. */
  maxDrawdown: number;
  /** (CAGR - riskFree) / volatility. */
  sharpe: number;
  bestYear: number;
  worstYear: number;
  months: number;
}

/** Summary statistics for a sequence of monthly simple returns. */
export function returnStats(monthly: number[], riskFreeRate = 0): ReturnStats {
  const months = monthly.length;
  let growth = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (const r of monthly) {
    growth *= 1 + r;
    peak = Math.max(peak, growth);
    maxDrawdown = Math.min(maxDrawdown, growth / peak - 1);
  }
  const cagr = months ? growth ** (12 / months) - 1 : 0;
  const volatility = stdev(monthly) * Math.sqrt(12);

  let bestYear = -Infinity;
  let worstYear = Infinity;
  for (let start = 0; start + 12 <= months; start++) {
    let g = 1;
    for (let i = start; i < start + 12; i++) g *= 1 + monthly[i];
    bestYear = Math.max(bestYear, g - 1);
    worstYear = Math.min(worstYear, g - 1);
  }
  if (!Number.isFinite(bestYear)) bestYear = worstYear = NaN;

  return {
    cagr,
    volatility,
    maxDrawdown,
    sharpe: volatility ? (cagr - riskFreeRate) / volatility : 0,
    bestYear,
    worstYear,
    months,
  };
}
