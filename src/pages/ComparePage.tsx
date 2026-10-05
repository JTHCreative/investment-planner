import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthProvider';
import { ChartLegend, SERIES_COLORS, ValueLineChart } from '../components/Charts';
import { BackIcon } from '../components/Icons';
import { money, monthLabel, pct, pctSigned } from '../lib/format';
import { useAlignedReturns, usePortfolios } from '../lib/hooks';
import { trailingYears } from '../lib/sim/series';
import { backtest, project } from '../lib/sim/simulate';

const MAX = 4;

type View = 'history' | 'projection';
type Outcome = 'p10' | 'p50' | 'p90';
const OUTCOMES: [Outcome, string][] = [
  ['p10', 'Pessimistic'],
  ['p50', 'Median'],
  ['p90', 'Optimistic'],
];

/** Put several plans through the same history and the same simulated futures, side by side. */
export function ComparePage() {
  const user = useUser();
  const portfolios = usePortfolios(user.uid);
  const withPlans = portfolios.data.filter((p) => p.targets.some((t) => t.weight > 0));
  const [picked, setPicked] = useState<string[] | null>(null);
  const selectedIds = picked ?? withPlans.slice(0, MAX).map((p) => p.id);
  const selected = withPlans.filter((p) => selectedIds.includes(p.id));
  const [amount, setAmount] = useState(100_000);
  const [years, setYears] = useState(20);
  const [lookback, setLookback] = useState(0);
  const [view, setView] = useState<View>('history');
  const [outcome, setOutcome] = useState<Outcome>('p50');

  const symbols = [...new Set(selected.flatMap((p) => p.targets.filter((t) => t.weight > 0).map((t) => t.symbol)))].sort();
  const aligned = useAlignedReturns(symbols);

  const results = useMemo(() => {
    if (!aligned.data || aligned.data.returns.length < 12) return null;
    const window = trailingYears(aligned.data, lookback);
    return selected.map((p) => {
      const weights = aligned.data!.symbols.map((s) => p.targets.find((t) => t.symbol === s)?.weight ?? 0);
      return {
        portfolio: p,
        backtest: backtest(window, weights, { initial: amount, rebalance: 'annually' }),
        projection: project(window.returns, weights, { initial: amount, years, paths: 1000, inflation: 0.025 }),
      };
    });
  }, [aligned.data, selected.map((p) => p.id + p.updatedAt).join(), amount, years, lookback]);

  function toggle(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id].slice(-MAX);
    setPicked(next);
  }

  if (portfolios.loading) return <p className="muted">Loading…</p>;
  if (withPlans.length < 2) {
    return (
      <div className="stack">
        <h1>Compare plans</h1>
        <p>Create at least two portfolios with a plan to compare them. <Link to="/">Back to portfolios</Link></p>
      </div>
    );
  }

  // Each plan keeps its color whatever else is selected (by its position in the full list).
  const colorOf = (id: string) => SERIES_COLORS[withPlans.findIndex((p) => p.id === id) % SERIES_COLORS.length];
  const chartData = results?.[0]?.backtest.months.map((m, i) => {
    const row: Record<string, string | number> = { month: monthLabel(m) };
    results.forEach((r, j) => (row[`s${j}`] = r.backtest.values[i]));
    return row;
  });
  const projectionData = results?.[0]?.projection.points.map((pt, i) => {
    const row: Record<string, string | number> = { year: `Yr ${pt.year}`, contributed: pt.contributed };
    results.forEach((r, j) => (row[`s${j}`] = r.projection.points[i][outcome]));
    return row;
  });
  const outcomeLabel = OUTCOMES.find(([o]) => o === outcome)![1];
  const plotSeries = results?.map((r, j) => ({ key: `s${j}`, label: r.portfolio.name, color: colorOf(r.portfolio.id) })) ?? [];
  const legend = results?.map((r) => ({ label: r.portfolio.name, color: colorOf(r.portfolio.id) })) ?? [];

  return (
    <>
      <Link to="/" className="back-link">
        <BackIcon />
        Back to portfolios
      </Link>
      <h1>Compare plans</h1>
      <section className="card" aria-label="Comparison settings">
        <fieldset className="choices" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <legend>Plans to compare (up to {MAX})</legend>
          {withPlans.map((p) => {
            const on = selectedIds.includes(p.id);
            return (
              <label key={p.id} className={`chip${on ? ' on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                {on && <span className="swatch" style={{ background: colorOf(p.id) }} />}
                {p.name}
              </label>
            );
          })}
        </fieldset>
        <div className="controls" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <label className="field">
            Amount
            <span className="affix has-pre">
              <span className="pre">$</span>
              <input type="number" min={1} step="any" value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} />
            </span>
          </label>
          <label className="field">
            History to use
            <select value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
              <option value={0}>All shared history</option>
              {[5, 10, 15, 20].map((y) => <option key={y} value={y}>Last {y} years</option>)}
            </select>
          </label>
          <label className="field">
            Project years
            <input type="number" min={1} max={50} value={years} onChange={(e) => setYears(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
          </label>
        </div>
      </section>

      {aligned.error && <p className="error">{aligned.error}</p>}
      {aligned.loading && <p className="muted">Loading price history…</p>}
      {!aligned.loading && aligned.data && !results && <p className="muted">These plans share less than a year of price history.</p>}
      {results && chartData && (
        <>
          <section className="card" aria-labelledby="chart-h" style={{ gap: 16 }}>
            <div className="segmented" role="radiogroup" aria-label="Chart to show">
              <button role="radio" aria-checked={view === 'history'} className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
                History
              </button>
              <button role="radio" aria-checked={view === 'projection'} className={view === 'projection' ? 'active' : ''} onClick={() => setView('projection')}>
                Projection
              </button>
            </div>
            {view === 'history' ? (
              <>
                <div className="card-head">
                  <h3 id="chart-h">History: {money(amount)} invested at the start</h3>
                  <p className="xsmall muted">
                    Every plan uses the same months ({monthLabel(results[0].backtest.months[0])} to {monthLabel(results[0].backtest.months.at(-1)!)}),
                    the period all of their investments have existed.
                  </p>
                </div>
                <ValueLineChart data={chartData} xKey="month" series={plotSeries} />
                <ChartLegend items={legend} />
              </>
            ) : (
              projectionData && (
                <>
                  <div className="card-head inline">
                    <div className="card-head">
                      <h3 id="chart-h">Projection: {money(amount)} over the next {years} years</h3>
                      <p className="xsmall muted">
                        The {outcomeLabel.toLowerCase()} outcome for each plan across 1,000 simulated futures, in today’s dollars.
                      </p>
                    </div>
                    <div className="segmented" role="radiogroup" aria-label="Outcome to show">
                      {OUTCOMES.map(([o, label]) => (
                        <button key={o} role="radio" aria-checked={outcome === o} className={outcome === o ? 'active' : ''} onClick={() => setOutcome(o)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ValueLineChart
                    data={projectionData}
                    xKey="year"
                    series={[...plotSeries, { key: 'contributed', label: 'Amount put in', color: 'var(--text-muted)', dashed: true }]}
                  />
                  <ChartLegend items={[...legend, { label: 'Amount put in', color: 'var(--text-muted)', kind: 'dash' }]} />
                </>
              )
            )}
          </section>
          <section className="card" aria-label="Comparison table" style={{ padding: 8, gap: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th className="num">Annual return</th>
                    <th className="num">Volatility</th>
                    <th className="num">Worst drop</th>
                    <th className="num">Worst 12 mo.</th>
                    <th className="num">In {years} yrs: pessimistic</th>
                    <th className="num">Median</th>
                    <th className="num">Optimistic</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const end = r.projection.points[r.projection.points.length - 1];
                    return (
                      <tr key={r.portfolio.id}>
                        <td>
                          <Link to={`/p/${r.portfolio.id}`} className="row" style={{ display: 'inline-flex', gap: 10 }}>
                            <span className="swatch" style={{ background: colorOf(r.portfolio.id) }} />
                            {r.portfolio.name}
                          </Link>
                        </td>
                        <td className="num">{pctSigned(r.backtest.stats.cagr)}</td>
                        <td className="num">{pct(r.backtest.stats.volatility)}</td>
                        <td className="num">{pctSigned(r.backtest.stats.maxDrawdown)}</td>
                        <td className="num">{pctSigned(r.backtest.stats.worstYear)}</td>
                        <td className="num">{money(end.p10)}</td>
                        <td className="num">{money(end.p50)}</td>
                        <td className="num">{money(end.p90)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="table-note" style={{ padding: '12px 16px 16px' }}>
              Projections are in today’s dollars (2.5% inflation), rebalanced yearly, from 1,000 simulated futures built out of the same
              history. Pessimistic and optimistic are the 10th and 90th percentiles. This is a simulation, not a promise or financial advice.
            </p>
          </section>
        </>
      )}
    </>
  );
}
