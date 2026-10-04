import { useMemo, useState } from 'react';
import { money, monthLabel, pct } from '../lib/format';
import { useAlignedReturns } from '../lib/hooks';
import { trailingYears } from '../lib/sim/series';
import { backtest, project, type RebalanceFrequency } from '../lib/sim/simulate';
import type { ReturnStats } from '../lib/sim/stats';
import type { Target } from '../lib/types';
import { FanChart, SERIES_COLORS, ValueLineChart } from './Charts';

const BENCHMARK = 'SPY';

function windowNote(months: string[]) {
  if (!months.length) return '';
  return `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])} (${(months.length / 12).toFixed(1)} years)`;
}

export function StatGrid({ stats, extra }: { stats: ReturnStats; extra?: [string, string][] }) {
  const items: [string, string, string][] = [
    ['Annual return', pct(stats.cagr), 'Compound annual growth rate (CAGR), dividends reinvested.'],
    ['Volatility', pct(stats.volatility), 'How much returns swing year to year (annualized standard deviation).'],
    ['Worst drop', pct(stats.maxDrawdown), 'Largest fall from a peak to a later low.'],
    ['Best 12 months', pct(stats.bestYear), ''],
    ['Worst 12 months', pct(stats.worstYear), ''],
    ['Sharpe ratio', stats.sharpe.toFixed(2), 'Return per unit of risk above the cash rate. Higher is better.'],
  ];
  return (
    <div className="stat-grid">
      {[...items, ...(extra ?? []).map(([a, b]) => [a, b, ''] as [string, string, string])].map(([label, value, help]) => (
        <div key={label} className="stat" title={help}>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
        </div>
      ))}
    </div>
  );
}

function useInputs(targets: Target[]) {
  const symbols = targets.filter((t) => t.weight > 0).map((t) => t.symbol);
  const weights = targets.filter((t) => t.weight > 0).map((t) => t.weight);
  return { symbols, weights };
}

const REBALANCE_OPTIONS: [RebalanceFrequency, string][] = [
  ['annually', 'Yearly'],
  ['quarterly', 'Quarterly'],
  ['monthly', 'Monthly'],
  ['none', 'Never'],
];

export function BacktestPanel({ targets, initial }: { targets: Target[]; initial: number }) {
  const { symbols, weights } = useInputs(targets);
  const includeBenchmark = !symbols.includes(BENCHMARK);
  const allSymbols = includeBenchmark ? [...symbols, BENCHMARK] : symbols;
  const aligned = useAlignedReturns(allSymbols);
  const [years, setYears] = useState(0);
  const [rebalance, setRebalance] = useState<RebalanceFrequency>('annually');
  const [cashRate, setCashRate] = useState(0.03);

  const result = useMemo(() => {
    if (!aligned.data || aligned.data.months.length < 2) return null;
    const window = trailingYears(aligned.data, years);
    const n = aligned.data.symbols.length;
    const pad = (w: number[]) => [...w, ...Array(n - w.length).fill(0)];
    const plan = backtest(window, pad(weights), { initial, rebalance, cashRate, riskFreeRate: cashRate });
    const benchWeights = Array(n).fill(0);
    benchWeights[aligned.data.symbols.indexOf(BENCHMARK)] = 1;
    const bench = backtest(window, benchWeights, { initial, rebalance: 'none', riskFreeRate: cashRate });
    return { plan, bench, window };
  }, [aligned.data, years, rebalance, cashRate, weights.join(','), initial]);

  if (!symbols.length) return <p className="muted">Add investments to the plan to backtest it.</p>;
  if (aligned.error) return <p className="error">{aligned.error}</p>;
  if (aligned.loading || !aligned.data) return <p className="muted">Loading price history…</p>;
  if (!result) return <p className="muted">Not enough shared history between these investments to backtest.</p>;

  const { plan, bench, window } = result;
  const data = plan.months.map((m, i) => ({ month: monthLabel(m), plan: plan.values[i], bench: bench.values[i] }));
  const maxYears = Math.floor(aligned.data.months.length / 12);

  return (
    <div className="stack">
      <div className="controls">
        <label>
          Period
          <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
            <option value={0}>All shared history ({maxYears} yrs)</option>
            {[1, 3, 5, 10, 15, 20, 30].filter((y) => y < maxYears).map((y) => (
              <option key={y} value={y}>Last {y} years</option>
            ))}
          </select>
        </label>
        <label>
          Rebalance
          <select value={rebalance} onChange={(e) => setRebalance(e.target.value as RebalanceFrequency)}>
            {REBALANCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          Cash yield
          <PercentInput value={cashRate} onChange={setCashRate} />
        </label>
      </div>
      <p className="muted small">
        If you had invested {money(initial)} in this plan over {windowNote(window.months)}. The window starts when the youngest
        investment began trading. Past results don’t guarantee future ones.
      </p>
      <div className="row wrap gap">
        <Headline label="Plan ended at" value={money(plan.values[plan.values.length - 1])} />
        <Headline label={`${BENCHMARK} (S&P 500) ended at`} value={money(bench.values[bench.values.length - 1])} muted />
      </div>
      <ValueLineChart
        data={data}
        xKey="month"
        series={[
          { key: 'plan', label: 'Your plan', color: SERIES_COLORS[0] },
          ...(includeBenchmark ? [{ key: 'bench', label: `${BENCHMARK} (S&P 500)`, color: 'var(--text-muted)', dashed: true }] : []),
        ]}
      />
      <h3>Your plan</h3>
      <StatGrid stats={plan.stats} />
      {includeBenchmark && (
        <details>
          <summary>{BENCHMARK} for comparison</summary>
          <StatGrid stats={bench.stats} />
        </details>
      )}
    </div>
  );
}

export function ProjectionPanel({ targets, initial }: { targets: Target[]; initial: number }) {
  const { symbols, weights } = useInputs(targets);
  const aligned = useAlignedReturns(symbols);
  const [years, setYears] = useState(20);
  const [monthly, setMonthly] = useState(0);
  const [adjust, setAdjust] = useState(0);
  const [inflation, setInflation] = useState(0.025);
  const [realDollars, setRealDollars] = useState(true);
  const [rebalance, setRebalance] = useState<RebalanceFrequency>('annually');
  const [cashRate, setCashRate] = useState(0.03);

  const result = useMemo(() => {
    if (!aligned.data || aligned.data.returns.length < 12) return null;
    return project(aligned.data.returns, weights, {
      initial,
      years,
      monthlyContribution: monthly,
      annualReturnAdjustment: adjust,
      inflation: realDollars ? inflation : 0,
      rebalance,
      cashRate,
      paths: 2000,
    });
  }, [aligned.data, weights.join(','), initial, years, monthly, adjust, inflation, realDollars, rebalance, cashRate]);

  if (!symbols.length) return <p className="muted">Add investments to the plan to project it.</p>;
  if (aligned.error) return <p className="error">{aligned.error}</p>;
  if (aligned.loading || !aligned.data) return <p className="muted">Loading price history…</p>;
  if (!result) return <p className="muted">These investments share less than a year of history, which is too little to project from.</p>;

  const last = result.points[result.points.length - 1];
  const historyYears = aligned.data.months.length / 12;

  return (
    <div className="stack">
      <div className="controls">
        <label>
          Years ahead
          <input type="number" min={1} max={50} value={years} onChange={(e) => setYears(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
        </label>
        <label>
          Add each month
          <input type="number" min={0} step={100} value={monthly} onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <label title="Shift every investment's yearly return. Use a negative number to be more conservative than history.">
          Return adjustment
          <PercentInput value={adjust} onChange={setAdjust} signed />
        </label>
        <label>
          Rebalance
          <select value={rebalance} onChange={(e) => setRebalance(e.target.value as RebalanceFrequency)}>
            {REBALANCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>
          Cash yield
          <PercentInput value={cashRate} onChange={setCashRate} />
        </label>
        <label>
          Inflation
          <PercentInput value={inflation} onChange={setInflation} />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={realDollars} onChange={(e) => setRealDollars(e.target.checked)} />
          Show in today’s dollars
        </label>
      </div>

      <div className="row wrap gap">
        <Headline label={`Median after ${years} years`} value={money(last.p50)} />
        <Headline label="Pessimistic (10th pct.)" value={money(last.p10)} muted />
        <Headline label="Optimistic (90th pct.)" value={money(last.p90)} muted />
        <Headline label={`Chance of ending below what you put in${realDollars ? ' (after inflation)' : ''}`} value={pct(result.probabilityOfLoss, 0)} muted />
      </div>
      <FanChart points={result.points} />
      <p className="muted small">
        2,000 possible futures, each built by stitching together random one-year stretches of these investments’ real
        monthly returns from the last {historyYears.toFixed(1)} years. Median annual return across them: {pct(result.medianCagr)}.
        {historyYears < 10 && ' With less than 10 years of history, this projection leans heavily on one market period. Treat it with extra caution.'}
        {realDollars ? ` Values are shown in today’s dollars, assuming ${pct(inflation)} inflation.` : ''} This is a simulation, not a promise or financial advice.
      </p>
    </div>
  );
}

function Headline({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`headline ${muted ? 'muted-headline' : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="headline-value">{value}</div>
    </div>
  );
}

function PercentInput({ value, onChange, signed }: { value: number; onChange: (v: number) => void; signed?: boolean }) {
  return (
    <span className="percent-input">
      <input
        type="number"
        step={0.5}
        min={signed ? -20 : 0}
        max={20}
        value={Math.round(value * 1000) / 10}
        onChange={(e) => onChange((Number(e.target.value) || 0) / 100)}
      />
      %
    </span>
  );
}
