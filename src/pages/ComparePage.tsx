import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthProvider';
import { SERIES_COLORS, ValueLineChart } from '../components/Charts';
import { money, monthLabel, pct } from '../lib/format';
import { useAlignedReturns, usePortfolios } from '../lib/hooks';
import { trailingYears } from '../lib/sim/series';
import { backtest, project } from '../lib/sim/simulate';

const MAX = 4;

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

  const chartData = results?.[0]?.backtest.months.map((m, i) => {
    const row: Record<string, string | number> = { month: monthLabel(m) };
    results.forEach((r, j) => (row[`s${j}`] = r.backtest.values[i]));
    return row;
  });

  return (
    <div className="stack">
      <h1>Compare plans</h1>
      <div className="card stack">
        <div className="row wrap gap-sm">
          {withPlans.map((p) => (
            <label key={p.id} className="chip checkbox">
              <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggle(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
        <div className="controls">
          <label>
            Amount
            <input type="number" min={1} step={1000} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label>
            History to use
            <select value={lookback} onChange={(e) => setLookback(Number(e.target.value))}>
              <option value={0}>All shared history</option>
              {[5, 10, 15, 20].map((y) => <option key={y} value={y}>Last {y} years</option>)}
            </select>
          </label>
          <label>
            Project years
            <input type="number" min={1} max={50} value={years} onChange={(e) => setYears(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
          </label>
        </div>
      </div>

      {aligned.error && <p className="error">{aligned.error}</p>}
      {aligned.loading && <p className="muted">Loading price history…</p>}
      {!aligned.loading && aligned.data && !results && <p className="muted">These plans share less than a year of price history.</p>}
      {results && chartData && (
        <>
          <div className="card">
            <h2>History: {money(amount)} invested at the start</h2>
            <p className="muted small">
              Every plan uses the same months ({monthLabel(results[0].backtest.months[0])} to {monthLabel(results[0].backtest.months.at(-1)!)}), the period all of their investments have existed.
            </p>
            <ValueLineChart
              data={chartData}
              xKey="month"
              series={results.map((r, j) => ({ key: `s${j}`, label: r.portfolio.name, color: SERIES_COLORS[j] }))}
            />
          </div>
          <div className="card table-wrap">
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
                {results.map((r, j) => {
                  const end = r.projection.points[r.projection.points.length - 1];
                  return (
                    <tr key={r.portfolio.id}>
                      <td>
                        <span className="swatch" style={{ background: SERIES_COLORS[j] }} />
                        <Link to={`/p/${r.portfolio.id}`}>{r.portfolio.name}</Link>
                      </td>
                      <td className="num">{pct(r.backtest.stats.cagr)}</td>
                      <td className="num">{pct(r.backtest.stats.volatility)}</td>
                      <td className="num">{pct(r.backtest.stats.maxDrawdown)}</td>
                      <td className="num">{pct(r.backtest.stats.worstYear)}</td>
                      <td className="num">{money(end.p10)}</td>
                      <td className="num"><strong>{money(end.p50)}</strong></td>
                      <td className="num">{money(end.p90)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted small">
              Projections are in today’s dollars (2.5% inflation), rebalanced yearly, from 1,000 simulated futures built out of the same history.
              Pessimistic and optimistic are the 10th and 90th percentiles. A simulation, not a forecast or advice.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
