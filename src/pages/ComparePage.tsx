import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthProvider';
import { ChartLegend, SERIES_COLORS, ValueLineChart } from '../components/Charts';
import { ArrowDownIcon, ArrowUpIcon, BackIcon } from '../components/Icons';
import { PlanAssets } from '../components/PlanAssets';
import { money, monthLabel, pct, pctSigned } from '../lib/format';
import { useAccessiblePortfolios, useHistories } from '../lib/hooks';
import { portfolioPath } from '../lib/paths';
import { alignMonthlyReturns, HISTORY_START, startingFrom, trailingYears, type AlignedReturns } from '../lib/sim/series';
import { backtest, project } from '../lib/sim/simulate';

const MAX = 4;

type View = 'history' | 'projection';
type Outcome = 'p10' | 'p50' | 'p90';
type SortKey = 'name' | 'since' | 'cagr' | 'volatility' | 'maxDrawdown' | 'worstYear' | 'p10' | 'p50' | 'p90';
type SortDir = 'asc' | 'desc';

const OUTCOMES: [Outcome, string][] = [
  ['p10', 'Pessimistic'],
  ['p50', 'Median'],
  ['p90', 'Optimistic'],
];

/**
 * Put several plans through history and simulated futures, side by side. Each plan goes back as far as all of its
 * investments have prices (from 2000 at the earliest), unless they're lined up on the months they all share.
 */
export function ComparePage() {
  const user = useUser();
  const portfolios = useAccessiblePortfolios(user.uid);
  const withPlans = portfolios.data.filter((p) => p.targets.some((t) => t.weight > 0));
  const [picked, setPicked] = useState<string[] | null>(null);
  const selectedIds = picked ?? withPlans.slice(0, MAX).map((p) => p.id);
  const selected = withPlans.filter((p) => selectedIds.includes(p.id));
  const [amount, setAmount] = useState(100_000);
  const [years, setYears] = useState(20);
  const [lookback, setLookback] = useState(0);
  const [samePeriod, setSamePeriod] = useState(false);
  const [view, setView] = useState<View>('history');
  const [outcome, setOutcome] = useState<Outcome>('p50');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  // The plan whose assets are shown beside the table. It stays set while the panel slides shut, so the panel
  // keeps its content until it's out of view.
  const [detail, setDetail] = useState<{ id: string; open: boolean } | null>(null);

  const symbols = [...new Set(selected.flatMap((p) => p.targets.filter((t) => t.weight > 0).map((t) => t.symbol)))].sort();
  const histories = useHistories(symbols);

  const computed = useMemo(() => {
    if (!histories.data.length) return null;
    const bySymbol = new Map(histories.data.map((h) => [h.symbol, h]));
    const planSymbols = (p: (typeof selected)[number]) => p.targets.filter((t) => t.weight > 0).map((t) => t.symbol).sort();
    if (!symbols.every((s) => bySymbol.has(s))) return null;
    // Each plan's own window: the months all of its investments have prices. Lined up, it's the months every plan shares.
    const shared = samePeriod ? alignMonthlyReturns(symbols.map((s) => bySymbol.get(s)!)) : null;
    const windowFor = (p: (typeof selected)[number]): AlignedReturns =>
      trailingYears(startingFrom(shared ?? alignMonthlyReturns(planSymbols(p).map((s) => bySymbol.get(s)!))), lookback);
    return selected.map((p) => {
      const window = windowFor(p);
      const weights = window.symbols.map((s) => p.targets.find((t) => t.symbol === s)?.weight ?? 0);
      // Under a year of prices is too little to say anything; such plans are listed as such and left out of the numbers.
      if (window.returns.length < 12) return { portfolio: p, tooShort: true as const };
      return {
        portfolio: p,
        tooShort: false as const,
        backtest: backtest(window, weights, { initial: amount, rebalance: 'annually' }),
        projection: project(window.returns, weights, { initial: amount, years, paths: 1000, inflation: 0.025 }),
      };
    });
  }, [histories.data, selected.map((p) => p.id + p.updatedAt).join(), amount, years, lookback, samePeriod]);
  type Computed = NonNullable<typeof computed>[number];
  const usable = computed?.filter((r): r is Extract<Computed, { tooShort: false }> => !r.tooShort) ?? [];
  const results = usable.length ? usable : null;
  const tooShort = computed?.filter((r) => r.tooShort).map((r) => r.portfolio.name) ?? [];

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
  // Plans can start in different months; each line begins where its plan's history does.
  const allMonths = results ? [...new Set(results.flatMap((r) => r.backtest.months))].sort() : [];
  const valueAt = results?.map((r) => new Map(r.backtest.months.map((m, i) => [m, r.backtest.values[i]])));
  const chartData = results
    ? allMonths.map((m) => {
        const row: Record<string, string | number> = { month: monthLabel(m) };
        valueAt!.forEach((v, j) => {
          const value = v.get(m);
          if (value !== undefined) row[`s${j}`] = value;
        });
        return row;
      })
    : undefined;
  const starts = results?.map((r) => r.backtest.months[0]) ?? [];
  const sameStart = starts.every((m) => m === starts[0]);
  const projectionData = results?.[0]?.projection.points.map((pt, i) => {
    const row: Record<string, string | number> = { year: `Yr ${pt.year}`, contributed: pt.contributed };
    results.forEach((r, j) => (row[`s${j}`] = r.projection.points[i][outcome]));
    return row;
  });
  const outcomeLabel = OUTCOMES.find(([o]) => o === outcome)![1];
  const plotSeries = results?.map((r, j) => ({ key: `s${j}`, label: r.portfolio.name, color: colorOf(r.portfolio.id) })) ?? [];

  type Row = NonNullable<typeof results>[number];
  const endOf = (r: Row) => r.projection.points[r.projection.points.length - 1];
  const columns: { key: SortKey; label: string; value: (r: Row) => number | string; show: (r: Row) => string }[] = [
    {
      key: 'since',
      label: 'History',
      value: (r) => r.backtest.months.length,
      show: (r) => `${monthLabel(r.backtest.months[0])} · ${((r.backtest.months.length - 1) / 12).toFixed(1)} yrs`,
    },
    { key: 'cagr', label: 'Annual return', value: (r) => r.backtest.stats.cagr, show: (r) => pctSigned(r.backtest.stats.cagr) },
    { key: 'volatility', label: 'Volatility', value: (r) => r.backtest.stats.volatility, show: (r) => pct(r.backtest.stats.volatility) },
    { key: 'maxDrawdown', label: 'Worst drop', value: (r) => r.backtest.stats.maxDrawdown, show: (r) => pctSigned(r.backtest.stats.maxDrawdown) },
    { key: 'worstYear', label: 'Worst 12 mo.', value: (r) => r.backtest.stats.worstYear, show: (r) => pctSigned(r.backtest.stats.worstYear) },
    { key: 'p10', label: `In ${years} yrs: pessimistic`, value: (r) => endOf(r).p10, show: (r) => money(endOf(r).p10) },
    { key: 'p50', label: 'Median', value: (r) => endOf(r).p50, show: (r) => money(endOf(r).p50) },
    { key: 'p90', label: 'Optimistic', value: (r) => endOf(r).p90, show: (r) => money(endOf(r).p90) },
  ];
  const sortValue = (r: Row, key: SortKey) => (key === 'name' ? r.portfolio.name : columns.find((c) => c.key === key)!.value(r));
  const rows = !results
    ? []
    : !sort
      ? results
      : [...results].sort((a, b) => {
          const x = sortValue(a, sort.key);
          const y = sortValue(b, sort.key);
          const order = typeof x === 'string' ? x.localeCompare(String(y)) : x - Number(y);
          return sort.dir === 'asc' ? order : -order;
        });
  // A new column starts with the biggest numbers on top (names A to Z); clicking it again flips the order.
  const sortBy = (key: SortKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const sortHeader = (key: SortKey, label: string, num: boolean) => {
    const active = sort?.key === key;
    const arrow = active && sort.dir === 'asc' ? <ArrowUpIcon size={12} /> : <ArrowDownIcon size={12} />;
    return (
      <th key={key} className={num ? 'num' : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        {/* The arrow sits on the side away from the column's alignment, so headers line up with their values. */}
        <button type="button" className={`sort-btn${active ? ' active' : ''}`} onClick={() => sortBy(key)}>
          {num && arrow}
          {label}
          {!num && arrow}
        </button>
      </th>
    );
  };
  const detailPlan = detail && results?.find((r) => r.portfolio.id === detail.id)?.portfolio;
  const detailOpen = !!detail?.open && !!detailPlan;
  // Clicking the open plan's row closes the panel; any other row opens it (or switches it) to that plan.
  const showDetail = (id: string) => setDetail(detailOpen && detail.id === id ? { id, open: false } : { id, open: true });
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
              <option value={0}>Since {HISTORY_START.slice(0, 4)}, or as far back as each plan goes</option>
              {[5, 10, 15, 20].map((y) => <option key={y} value={y}>Last {y} years</option>)}
            </select>
          </label>
          <label className="field">
            Project years
            <input type="number" min={1} max={50} value={years} onChange={(e) => setYears(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={samePeriod} onChange={(e) => setSamePeriod(e.target.checked)} />
          <span>
            Use the same months for every plan
            <span className="xsmall muted"> — a fairer race, but limited by whichever plan has the shortest history</span>
          </span>
        </label>
      </section>

      {histories.error && <p className="error">{histories.error}</p>}
      {histories.loading && <p className="muted">Loading price history…</p>}
      {!histories.loading && tooShort.length > 0 && (
        <p className="muted small">
          {samePeriod
            ? 'These plans share less than a year of price history. Turn off “Use the same months for every plan” to let each go back as far as it can.'
            : `Left out for having less than a year of price history: ${tooShort.join(', ')}.`}
        </p>
      )}
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
                    {sameStart
                      ? `Every plan starts in ${monthLabel(starts[0])}${samePeriod ? ', the first month all of their investments have prices' : ''} and runs to ${monthLabel(allMonths.at(-1)!)}.`
                      : `Each plan goes back as far as all of its investments have prices, from ${HISTORY_START.slice(0, 4)} at the earliest, so lines start at different times. Plans that start later have had less time to grow, so compare annual returns in the table rather than end values.`}
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
          <div className={`compare-split${detailOpen ? ' open' : ''}`}>
            <section className="card" aria-label="Comparison table" style={{ padding: 8, gap: 0 }}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {sortHeader('name', 'Plan', false)}
                      {columns.map((c) => sortHeader(c.key, c.label, true))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.portfolio.id}
                        className={`pickable${detailOpen && detail.id === r.portfolio.id ? ' picked' : ''}`}
                        tabIndex={0}
                        aria-label={`${r.portfolio.name}: ${detailOpen && detail.id === r.portfolio.id ? 'hide' : 'show'} its assets`}
                        aria-controls="plan-assets"
                        onClick={() => showDetail(r.portfolio.id)}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                          e.preventDefault();
                          showDetail(r.portfolio.id);
                        }}
                      >
                        <td>
                          <Link
                            to={portfolioPath(r.portfolio, user.uid)}
                            className="row"
                            style={{ display: 'inline-flex', gap: 10 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="swatch" style={{ background: colorOf(r.portfolio.id) }} />
                            {r.portfolio.name}
                          </Link>
                        </td>
                        {columns.map((c) => (
                          <td key={c.key} className="num">{c.show(r)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="table-note" style={{ padding: '12px 16px 16px' }}>
                Each plan’s returns and risk cover the period in its History column. Projections are in today’s dollars (2.5% inflation),
                rebalanced yearly, from 1,000 simulated futures built out of that same history. Pessimistic and optimistic are the 10th
                and 90th percentiles. This is a simulation, not a promise or financial advice.
              </p>
            </section>
            <aside
              id="plan-assets"
              className="card compare-detail"
              aria-label={detailPlan ? `Assets in ${detailPlan.name}` : 'Plan assets'}
              aria-hidden={!detailOpen}
              inert={!detailOpen}
            >
              {detailPlan && (
                <PlanAssets
                  portfolio={detailPlan}
                  color={colorOf(detailPlan.id)}
                  onClose={() => setDetail((d) => d && { ...d, open: false })}
                />
              )}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
