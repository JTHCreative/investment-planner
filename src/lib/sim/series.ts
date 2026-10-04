import type { PriceSeries } from '../types';

export interface MonthlySeries {
  symbol: string;
  /** YYYY-MM, ascending. */
  months: string[];
  /** Last adjusted close of each month. */
  closes: number[];
}

/** Collapse a daily series to month-end closes. */
export function toMonthly(series: PriceSeries): MonthlySeries {
  const months: string[] = [];
  const closes: number[] = [];
  for (let i = 0; i < series.dates.length; i++) {
    const close = series.closes[i];
    if (!(close > 0)) continue;
    const month = series.dates[i].slice(0, 7);
    if (months.length && months[months.length - 1] === month) {
      closes[closes.length - 1] = close;
    } else {
      months.push(month);
      closes.push(close);
    }
  }
  return { symbol: series.symbol, months, closes };
}

export interface AlignedReturns {
  symbols: string[];
  /** The month each return row ends in (YYYY-MM). */
  months: string[];
  /** returns[t][i] = simple return of asset i during month t. */
  returns: number[][];
}

/**
 * Monthly simple returns for several assets over the months they all share.
 * The usable window is limited by the youngest asset.
 */
export function alignMonthlyReturns(series: PriceSeries[]): AlignedReturns {
  const monthly = series.map(toMonthly);
  const symbols = monthly.map((m) => m.symbol);
  if (monthly.length === 0) return { symbols, months: [], returns: [] };

  const lookups = monthly.map((m) => new Map(m.months.map((mo, i) => [mo, m.closes[i]])));
  const common = monthly[0].months.filter((mo) => lookups.every((l) => l.has(mo)));

  const months: string[] = [];
  const returns: number[][] = [];
  for (let t = 1; t < common.length; t++) {
    months.push(common[t]);
    returns.push(lookups.map((l) => l.get(common[t])! / l.get(common[t - 1])! - 1));
  }
  return { symbols, months, returns };
}

/** Keep only the trailing `years` of an aligned window (all of it if `years` is 0 or larger than available). */
export function trailingYears(aligned: AlignedReturns, years: number): AlignedReturns {
  const n = Math.round(years * 12);
  if (!n || n >= aligned.months.length) return aligned;
  return {
    symbols: aligned.symbols,
    months: aligned.months.slice(-n),
    returns: aligned.returns.slice(-n),
  };
}

/** Last close on or before `date` (YYYY-MM-DD), or undefined if the series starts later. */
export function closeOnOrBefore(series: PriceSeries, date: string): number | undefined {
  let lo = 0;
  let hi = series.dates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.dates[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 ? series.closes[found] : undefined;
}
