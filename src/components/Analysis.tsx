import { useMemo, useState, type ReactNode } from 'react';
import { money, moneyExact, monthLabel, pct, pctSigned } from '../lib/format';
import { useAlignedReturns } from '../lib/hooks';
import { HISTORY_START, startingFrom, trailingYears } from '../lib/sim/series';
import { backtest, project, type RebalanceFrequency } from '../lib/sim/simulate';
import type { ReturnStats } from '../lib/sim/stats';
import type { Target } from '../lib/types';
import { ChartLegend, FanChart, ValueLineChart } from './Charts';
import { ChevronIcon, InfoIcon } from './Icons';

const BENCHMARK = 'SPY';

function windowNote(months: string[]) {
  if (!months.length) return '';
  return `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])} (${(months.length / 12).toFixed(1)} years)`;
}

/** Six key numbers in a joined grid. */
export function StatGrid({ stats }: { stats: ReturnStats }) {
  const items: [string, string, string][] = [
    ['Annual return', pctSigned(stats.cagr), 'Compound annual growth rate (CAGR), dividends reinvested.'],
    ['Volatility', pct(stats.volatility), 'How much returns swing year to year (annualized standard deviation).'],
    ['Worst drop', pctSigned(stats.maxDrawdown), 'Largest fall from a peak to a later low.'],
    ['Best 12 months', pctSigned(stats.bestYear), ''],
    ['Worst 12 months', pctSigned(stats.worstYear), ''],
    ['Sharpe ratio', stats.sharpe.toFixed(2), 'Return per unit of risk above the cash rate. Higher is better.'],
  ];
  return (
    <div className="metric-grid">
      {items.map(([label, value, help]) => (
        <div key={label} title={help || undefined}>
          <span className="label">{label}</span>
          <span className="value">{value}</span>
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

function Message({ children, error }: { children: ReactNode; error?: boolean }) {
  return <p className={error ? 'error' : 'muted small'}>{children}</p>;
}

export function BacktestPanel({ targets, initial, sourceControl }: { targets: Target[]; initial: number; sourceControl?: ReactNode }) {
  const { symbols, weights } = useInputs(targets);
  const includeBenchmark = !symbols.includes(BENCHMARK);
  const allSymbols = includeBenchmark ? [...symbols, BENCHMARK] : symbols;
  const aligned = useAlignedReturns(allSymbols);
  const [years, setYears] = useState(0);
  const [rebalance, setRebalance] = useState<RebalanceFrequency>('annually');
  const [cashRate, setCashRate] = useState(0.03);

  const result = useMemo(() => {
    if (!aligned.data) return null;
    const window = trailingYears(startingFrom(aligned.data), years);
    if (window.months.length < 2) return null;
    const n = aligned.data.symbols.length;
    const pad = (w: number[]) => [...w, ...Array(n - w.length).fill(0)];
    const plan = backtest(window, pad(weights), { initial, rebalance, cashRate, riskFreeRate: cashRate });
    const benchWeights = Array(n).fill(0);
    benchWeights[aligned.data.symbols.indexOf(BENCHMARK)] = 1;
    const bench = backtest(window, benchWeights, { initial, rebalance: 'none', riskFreeRate: cashRate });
    return { plan, bench, window };
  }, [aligned.data, years, rebalance, cashRate, weights.join(','), initial]);

  const available = aligned.data ? startingFrom(aligned.data).months : [];
  const maxYears = Math.floor(available.length / 12);
  const fromYear = available.length ? Number(available[0].slice(0, 4)) : Number(HISTORY_START.slice(0, 4));

  let body: ReactNode;
  if (!symbols.length) body = <Message>Add investments to the plan to backtest it.</Message>;
  else if (aligned.error) body = <Message error>{aligned.error}</Message>;
  else if (aligned.loading || !aligned.data) body = <Message>Loading price history…</Message>;
  else if (!result) body = <Message>Not enough shared history between these investments to backtest.</Message>;
  else {
    const { plan, bench, window } = result;
    const data = plan.months.map((m, i) => ({ month: monthLabel(m), plan: plan.values[i], bench: bench.values[i] }));
    body = (
      <>
        <p className="small muted" style={{ maxWidth: 860 }}>
          If you had invested {moneyExact(initial)} in this plan over {windowNote(window.months)}. The window starts when the youngest
          investment began trading. Past results don’t guarantee future ones.
        </p>
        <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="stat-card inner accent">
            <span className="label">Plan ended at</span>
            <span className="value lg">{moneyExact(plan.values[plan.values.length - 1])}</span>
          </div>
          {includeBenchmark && (
            <div className="stat-card inner">
              <span className="label">{BENCHMARK} (S&amp;P 500) ended at</span>
              <span className="value lg dim">{moneyExact(bench.values[bench.values.length - 1])}</span>
            </div>
          )}
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <ValueLineChart
            data={data}
            xKey="month"
            series={[
              ...(includeBenchmark ? [{ key: 'bench', label: `${BENCHMARK} (S&P 500)`, color: 'var(--text-muted)', dashed: true }] : []),
              { key: 'plan', label: 'Your plan', color: 'var(--line)' },
            ]}
          />
          <ChartLegend
            items={[
              { label: 'Your plan', color: 'var(--line)' },
              ...(includeBenchmark ? [{ label: `${BENCHMARK} (S&P 500)`, color: 'var(--text-muted)', kind: 'dash' as const }] : []),
            ]}
          />
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <h3>Your plan</h3>
          <StatGrid stats={plan.stats} />
        </div>
        {includeBenchmark && (
          <details className="disclosure">
            <summary>
              <ChevronIcon />
              {BENCHMARK} for comparison
            </summary>
            <p className="small muted">
              Annual return {pctSigned(bench.stats.cagr)} · Volatility {pct(bench.stats.volatility)} · Worst drop{' '}
              {pctSigned(bench.stats.maxDrawdown)} · Worst 12 months {pctSigned(bench.stats.worstYear)} · Sharpe {bench.stats.sharpe.toFixed(2)}
            </p>
          </details>
        )}
      </>
    );
  }

  return (
    <section className="card" aria-label="Backtest" style={{ gap: 24 }}>
      <div className="row wrap" style={{ alignItems: 'flex-end', gap: '16px 20px' }}>
        {sourceControl}
        <div className="grow" />
        <label className="field" style={{ flex: '0 1 280px' }}>
          Period
          <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
            <option value={0}>Since {fromYear}{maxYears ? ` (${maxYears} yrs)` : ''}</option>
            {[1, 3, 5, 10, 15, 20, 30].filter((y) => y < maxYears).map((y) => (
              <option key={y} value={y}>Last {y} years</option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: '0 1 160px' }}>
          Rebalance
          <select value={rebalance} onChange={(e) => setRebalance(e.target.value as RebalanceFrequency)}>
            {REBALANCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: '0 1 120px' }}>
          Cash yield
          <PercentInput value={cashRate} onChange={setCashRate} />
        </label>
      </div>
      {body}
    </section>
  );
}

export function ProjectionPanel({ targets, initial, sourceControl }: { targets: Target[]; initial: number; sourceControl?: ReactNode }) {
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

  const settings = (
    <section className="card controls" aria-label="Projection settings" style={{ display: 'grid' }}>
      {sourceControl && <div style={{ gridColumn: '1 / -1' }}>{sourceControl}</div>}
      <label className="field">
        Years ahead
        <input type="number" min={1} max={50} value={years} onChange={(e) => setYears(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
      </label>
      <label className="field">
        Add each month
        <span className="affix has-pre">
          <span className="pre">$</span>
          <input type="number" min={0} step={100} value={monthly} onChange={(e) => setMonthly(Math.max(0, Number(e.target.value) || 0))} />
        </span>
      </label>
      <label className="field" title="Shift every investment's yearly return. Use a negative number to be more conservative than history.">
        <span className="row" style={{ gap: 6 }}>
          Return adjustment
          <InfoIcon size={14} />
        </span>
        <PercentInput value={adjust} onChange={setAdjust} signed />
      </label>
      <label className="field">
        Rebalance
        <select value={rebalance} onChange={(e) => setRebalance(e.target.value as RebalanceFrequency)}>
          {REBALANCE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <label className="field">
        Cash yield
        <PercentInput value={cashRate} onChange={setCashRate} />
      </label>
      <label className="field">
        Inflation
        <PercentInput value={inflation} onChange={setInflation} />
      </label>
      <label className="check" style={{ gridColumn: '1 / -1' }}>
        <input type="checkbox" checked={realDollars} onChange={(e) => setRealDollars(e.target.checked)} />
        Show in today’s dollars
      </label>
    </section>
  );

  let body: ReactNode;
  if (!symbols.length) body = <section className="card"><Message>Add investments to the plan to project it.</Message></section>;
  else if (aligned.error) body = <section className="card"><Message error>{aligned.error}</Message></section>;
  else if (aligned.loading || !aligned.data) body = <section className="card"><Message>Loading price history…</Message></section>;
  else if (!result) {
    body = (
      <section className="card">
        <Message>These investments share less than a year of history, which is too little to project from.</Message>
      </section>
    );
  } else {
    const last = result.points[result.points.length - 1];
    const historyYears = aligned.data.months.length / 12;
    body = (
      <>
        <div className="stat-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div className="stat-card accent">
            <span className="label">Median after {years} years</span>
            <span className="value lg">{money(last.p50)}</span>
          </div>
          <div className="stat-card">
            <span className="label">Pessimistic (10th pct.)</span>
            <span className="value lg">{money(last.p10)}</span>
          </div>
          <div className="stat-card">
            <span className="label">Optimistic (90th pct.)</span>
            <span className="value lg">{money(last.p90)}</span>
          </div>
          <div className="stat-card">
            <span className="label">Chance of ending below what you put in{realDollars ? ' (after inflation)' : ''}</span>
            <span className="value lg">{pct(result.probabilityOfLoss, 1)}</span>
          </div>
        </div>
        <section className="card" aria-labelledby="fan-h" style={{ gap: 16 }}>
          <div className="card-head inline">
            <h3 id="fan-h">Range of possible outcomes</h3>
            <span className="small muted">Total put in: {money(last.contributed)}</span>
          </div>
          <FanChart points={result.points} />
          <ChartLegend
            items={[
              { label: 'Median', color: 'var(--text)' },
              { label: '25th–75th percentile', color: 'var(--band-inner)', kind: 'block' },
              { label: '10th–90th percentile', color: 'var(--band-outer)', kind: 'block' },
              { label: 'Total put in', color: 'var(--text-muted)', kind: 'dash' },
            ]}
          />
          <p className="small muted" style={{ maxWidth: 820 }}>
            2,000 possible futures, each built by stitching together random one-year stretches of these investments’ real monthly returns
            from the last {historyYears.toFixed(1)} years. Median annual return across them: {pct(result.medianCagr)}.
            {historyYears < 10 && ' With less than 10 years of history, this projection leans heavily on one market period. Treat it with extra caution.'}
            {realDollars ? ` Values are shown in today’s dollars, assuming ${pct(inflation)} inflation.` : ''} This is a simulation, not a
            promise or financial advice.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      {settings}
      {body}
    </>
  );
}

function PercentInput({ value, onChange, signed }: { value: number; onChange: (v: number) => void; signed?: boolean }) {
  return (
    <span className="affix has-post">
      <input
        type="number"
        step={0.5}
        min={signed ? -20 : 0}
        max={20}
        value={Math.round(value * 1000) / 10}
        onChange={(e) => onChange((Number(e.target.value) || 0) / 100)}
      />
      <span className="post">%</span>
    </span>
  );
}
