import { describe, expect, it } from 'vitest';
import type { PriceSeries } from '../types';
import { applyTrades, planRebalance, totalValue, validateTargets } from './rebalance';
import { alignMonthlyReturns, closeOnOrBefore, toMonthly, trailingYears } from './series';
import { backtest, mulberry32, project, runPath } from './simulate';
import { returnStats } from './stats';
import { valueHistory } from './valuation';

function monthlySeries(symbol: string, startYear: number, closes: number[]): PriceSeries {
  const dates = closes.map((_, i) => {
    const y = startYear + Math.floor(i / 12);
    const m = (i % 12) + 1;
    return `${y}-${String(m).padStart(2, '0')}-28`;
  });
  return { symbol, dates, closes };
}

describe('series', () => {
  it('collapses daily data to month-end closes', () => {
    const s: PriceSeries = {
      symbol: 'X',
      dates: ['2020-01-02', '2020-01-31', '2020-02-03', '2020-02-28'],
      closes: [1, 2, 3, 4],
    };
    expect(toMonthly(s)).toEqual({ symbol: 'X', months: ['2020-01', '2020-02'], closes: [2, 4] });
  });

  it('aligns returns to the shared window', () => {
    const a = monthlySeries('A', 2020, [100, 110, 121, 133.1]);
    const b: PriceSeries = { symbol: 'B', dates: ['2020-02-28', '2020-03-28', '2020-04-28'], closes: [50, 50, 25] };
    const aligned = alignMonthlyReturns([a, b]);
    expect(aligned.months).toEqual(['2020-03', '2020-04']);
    expect(aligned.returns[0][0]).toBeCloseTo(0.1);
    expect(aligned.returns[1][1]).toBeCloseTo(-0.5);
    expect(trailingYears(aligned, 0).months.length).toBe(2);
  });

  it('finds the close on or before a date', () => {
    const s: PriceSeries = { symbol: 'X', dates: ['2020-01-02', '2020-01-06'], closes: [1, 2] };
    expect(closeOnOrBefore(s, '2020-01-01')).toBeUndefined();
    expect(closeOnOrBefore(s, '2020-01-05')).toBe(1);
    expect(closeOnOrBefore(s, '2021-01-01')).toBe(2);
  });
});

describe('rebalance', () => {
  it('invests $100k by target weights, leaving the rest in cash', () => {
    const state = { cash: 100_000, holdings: {} };
    const prices = { VTI: 250, BND: 75 };
    const trades = planRebalance(state, [
      { symbol: 'VTI', weight: 0.6 },
      { symbol: 'BND', weight: 0.3 },
    ], prices);
    const next = applyTrades(state, trades);
    expect(next.holdings.VTI.shares).toBeCloseTo(240);
    expect(next.holdings.BND.shares).toBeCloseTo(400);
    expect(next.cash).toBeCloseTo(10_000);
    expect(totalValue(next, prices)).toBeCloseTo(100_000);
  });

  it('sells overweight positions and trims cost basis proportionally', () => {
    const state = { cash: 0, holdings: { A: { shares: 100, costBasis: 1000 }, B: { shares: 0.0001, costBasis: 0 } } };
    const prices = { A: 20, B: 10 };
    const trades = planRebalance(state, [{ symbol: 'A', weight: 0.5 }, { symbol: 'B', weight: 0.5 }], prices);
    expect(trades[0]).toMatchObject({ symbol: 'A', side: 'sell' });
    const next = applyTrades(state, trades);
    expect(next.holdings.A.shares).toBeCloseTo(50, 3);
    expect(next.holdings.A.costBasis).toBeCloseTo(500, 1);
    expect(next.holdings.B.shares).toBeCloseTo(100, 3);
  });

  it('rejects allocations over 100% and duplicates', () => {
    expect(validateTargets([{ symbol: 'A', weight: 0.7 }, { symbol: 'B', weight: 0.4 }])).toMatch(/over 100%/);
    expect(validateTargets([{ symbol: 'A', weight: 0.1 }, { symbol: 'A', weight: 0.1 }])).toMatch(/more than once/);
    expect(validateTargets([{ symbol: 'A', weight: 1 }])).toBeNull();
  });

  it('refuses to oversell', () => {
    expect(() =>
      applyTrades({ cash: 0, holdings: { A: { shares: 1, costBasis: 1 } } }, [
        { symbol: 'A', side: 'sell', shares: 2, price: 1, amount: 2 },
      ]),
    ).toThrow();
  });
});

describe('simulation', () => {
  it('compounds a constant return', () => {
    const rows = Array.from({ length: 24 }, () => [0.01]);
    const path = runPath(rows, [1], { initial: 1000 });
    expect(path.values[24]).toBeCloseTo(1000 * 1.01 ** 24);
  });

  it('keeps unallocated money in cash at the cash rate', () => {
    const rows = Array.from({ length: 12 }, () => [0]);
    const path = runPath(rows, [0.5], { initial: 1000, cashRate: 0.04 });
    expect(path.values[12]).toBeCloseTo(500 + 500 * 1.04);
  });

  it('rebalancing changes the outcome when assets diverge', () => {
    const rows = Array.from({ length: 24 }, (_, t) => (t % 2 ? [0.2, -0.1] : [-0.1, 0.2]));
    const none = runPath(rows, [0.5, 0.5], { initial: 1, rebalance: 'none' }).values[24];
    const monthly = runPath(rows, [0.5, 0.5], { initial: 1, rebalance: 'monthly' }).values[24];
    expect(monthly).toBeGreaterThan(none);
  });

  it('excludes contributions from time-weighted returns', () => {
    const rows = Array.from({ length: 12 }, () => [0]);
    const path = runPath(rows, [1], { initial: 1000, monthlyContribution: 100 });
    expect(path.values[12]).toBeCloseTo(2200);
    expect(path.contributed).toBe(2200);
    expect(Math.max(...path.returns)).toBeCloseTo(0);
  });

  it('computes drawdown and CAGR', () => {
    const s = returnStats([0.1, -0.5, 0.2, ...Array(9).fill(0)]);
    expect(s.maxDrawdown).toBeCloseTo(-0.5);
    expect(s.cagr).toBeCloseTo(1.1 * 0.5 * 1.2 - 1);
  });

  it('backtests with a labelled starting month', () => {
    const aligned = alignMonthlyReturns([monthlySeries('A', 2020, [100, 110, 121])]);
    const result = backtest(aligned, [1], { initial: 100 });
    expect(result.months).toEqual(['2020-01', '2020-02', '2020-03']);
    expect(result.values[2]).toBeCloseTo(121);
  });

  it('produces ordered, repeatable percentile bands', () => {
    const rand = mulberry32(7);
    const history = Array.from({ length: 120 }, () => [0.007 + (rand() - 0.5) * 0.1, 0.003 + (rand() - 0.5) * 0.02]);
    const opts = { initial: 100_000, years: 10, paths: 500, seed: 1 };
    const a = project(history, [0.6, 0.4], opts);
    const b = project(history, [0.6, 0.4], opts);
    expect(a.points).toHaveLength(11);
    expect(a.points[0].p50).toBeCloseTo(100_000);
    for (const p of a.points) {
      expect(p.p10).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.p90);
    }
    expect(a.points[10].p50).toBe(b.points[10].p50);
    expect(a.medianCagr).toBeGreaterThan(0);
  });

  it('shifts projections with a return adjustment and deflates for inflation', () => {
    const history = Array.from({ length: 24 }, () => [0]);
    const up = project(history, [1], { initial: 100, years: 1, paths: 10, annualReturnAdjustment: 0.1 });
    expect(up.points[1].p50).toBeCloseTo(110);
    const real = project(history, [1], { initial: 100, years: 1, paths: 10, inflation: 0.1 });
    expect(real.points[1].p50).toBeCloseTo(100 / 1.1);
    expect(up.probabilityOfLoss).toBe(0);
    expect(real.probabilityOfLoss).toBe(1);
  });
});

describe('valuation', () => {
  it('tracks a buy through price changes', () => {
    const series = { A: { symbol: 'A', dates: ['2024-01-02', '2024-01-03', '2024-01-04'], closes: [10, 11, 12] } };
    const points = valueHistory(
      [{ id: '1', type: 'buy', symbol: 'A', shares: 5, price: 10, amount: 50, at: Date.parse('2024-01-02T15:00:00Z') }],
      series,
      100,
      '2024-01-04',
    );
    expect(points.map((p) => p.value)).toEqual([100, 105, 110]);
  });

  it('uses the fill price when monthly history has no point on the trade day', () => {
    const series = { A: { symbol: 'A', dates: ['2024-01-31', '2024-02-29', '2024-03-15'], closes: [8, 12, 15] } };
    const points = valueHistory(
      [{ id: '1', type: 'buy', symbol: 'A', shares: 10, price: 10, amount: 100, at: Date.parse('2024-02-10T15:00:00Z') }],
      series,
      100,
      '2024-03-15',
    );
    // Opening day: still worth what was paid, even though January's close was lower.
    expect(points.map((p) => [p.date, p.value])).toEqual([
      ['2024-02-10', 100],
      ['2024-02-29', 120],
      ['2024-03-15', 150],
    ]);
  });
});
