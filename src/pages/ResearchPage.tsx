import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SERIES_COLORS, ValueLineChart } from '../components/Charts';
import { StatGrid } from '../components/Analysis';
import { SymbolSearch, typeLabel } from '../components/SymbolSearch';
import { moneyCompact, moneyExact, pct } from '../lib/format';
import { useHistories, useQuotes } from '../lib/hooks';
import { toMonthly } from '../lib/sim/series';
import { returnStats } from '../lib/sim/stats';

const RANGES: [string, number][] = [
  ['1Y', 1],
  ['5Y', 5],
  ['10Y', 10],
  ['20Y', 20],
  ['Max', 0],
];

export function ResearchPage() {
  const { symbol = '' } = useParams();
  const navigate = useNavigate();
  const sym = symbol.toUpperCase();
  const quotes = useQuotes(sym ? [sym] : []);
  const histories = useHistories(sym ? [sym] : []);
  const [range, setRange] = useState(5);
  const q = quotes.data[sym];
  const history = histories.data[0];

  const view = useMemo(() => {
    if (!history?.dates.length) return null;
    const last = history.dates[history.dates.length - 1];
    const cutoff = range ? `${Number(last.slice(0, 4)) - range}${last.slice(4)}` : '';
    const start = cutoff ? history.dates.findIndex((d) => d >= cutoff) : 0;
    const dates = history.dates.slice(start);
    const closes = history.closes.slice(start);
    // Thin daily points so long ranges stay fast to draw.
    const step = Math.max(1, Math.floor(dates.length / 600));
    const data = [];
    for (let i = 0; i < dates.length; i++) {
      if (i % step === 0 || i === dates.length - 1) data.push({ date: dates[i], close: closes[i] });
    }
    const monthly = toMonthly({ symbol: sym, dates, closes });
    const returns = monthly.closes.slice(1).map((c, i) => c / monthly.closes[i] - 1);
    return { data, stats: returnStats(returns), from: dates[0], years: returns.length / 12 };
  }, [history, range, sym]);

  return (
    <div className="stack">
      <h1>Research</h1>
      <SymbolSearch onSelect={(r) => navigate(`/research/${encodeURIComponent(r.symbol)}`)} placeholder="Look up a stock, ETF, bond fund…" />
      {!sym && (
        <p className="muted">
          Search for anything to see its price history and how risky it has been. Bonds are easiest to explore through bond
          funds and ETFs such as BND, AGG, TLT, or SGOV (short-term Treasuries).
        </p>
      )}
      {sym && (
        <div className="card stack">
          <div className="row spread wrap">
            <div>
              <h2>
                {sym} <span className="tag">{typeLabel(q?.type)}</span>
              </h2>
              <div className="muted">{q?.name}{q?.exchange ? ` · ${q.exchange}` : ''}</div>
            </div>
            {q && (
              <div className="headline">
                <div className="headline-value">{moneyExact(q.price)}</div>
                {q.changePercent !== undefined && (
                  <div className={q.changePercent >= 0 ? 'gain' : 'loss'}>{pct(q.changePercent / 100, 2, true)} today</div>
                )}
              </div>
            )}
          </div>
          {quotes.error && <p className="error">{quotes.error}</p>}
          {q && (
            <div className="stat-grid">
              <Stat label="52-week range" value={q.fiftyTwoWeekLow ? `${moneyExact(q.fiftyTwoWeekLow)} – ${moneyExact(q.fiftyTwoWeekHigh ?? NaN)}` : '—'} />
              <Stat label="Dividend yield" value={q.dividendYield ? pct(q.dividendYield, 2) : '—'} />
              <Stat label="Market cap" value={q.marketCap ? moneyCompact(q.marketCap) : '—'} />
              <Stat label="P/E" value={q.trailingPE ? q.trailingPE.toFixed(1) : '—'} />
            </div>
          )}

          <div className="segmented" role="radiogroup" aria-label="Range">
            {RANGES.map(([label, years]) => (
              <button key={label} role="radio" aria-checked={range === years} className={range === years ? 'active' : ''} onClick={() => setRange(years)}>
                {label}
              </button>
            ))}
          </div>
          {histories.loading && <p className="muted">Loading history…</p>}
          {histories.error && <p className="error">{histories.error}</p>}
          {view && (
            <>
              <ValueLineChart data={view.data} xKey="date" series={[{ key: 'close', label: 'Adjusted price', color: SERIES_COLORS[0] }]} />
              <p className="muted small">
                Prices are adjusted for dividends and splits, so the chart shows total return. Stats cover {view.years.toFixed(1)} years from {view.from}.
              </p>
              {view.stats.months >= 12 && <StatGrid stats={view.stats} />}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
