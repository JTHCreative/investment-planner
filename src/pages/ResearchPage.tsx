import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AreaValueChart } from '../components/Charts';
import { GainBadge } from '../components/Icons';
import { StatGrid } from '../components/Analysis';
import { SymbolSearch, typeLabel } from '../components/SymbolSearch';
import { moneyCompact, moneyExact, monthLabel, pct, pctSigned } from '../lib/format';
import { useHistories, useQuotes } from '../lib/hooks';
import { getDetails } from '../lib/market';
import type { Details } from '../lib/providers/finnhub';
import { toMonthly } from '../lib/sim/series';
import { returnStats } from '../lib/sim/stats';

const RANGES: [string, number][] = [
  ['1Y', 1],
  ['5Y', 5],
  ['10Y', 10],
  ['20Y', 20],
  ['All', 0],
];

export function ResearchPage() {
  const { symbol = '' } = useParams();
  const navigate = useNavigate();
  const sym = symbol.toUpperCase();
  const quotes = useQuotes(sym ? [sym] : []);
  const histories = useHistories(sym ? [sym] : []);
  const [range, setRange] = useState(5);
  const [details, setDetails] = useState<Details>({});
  useEffect(() => {
    setDetails({});
    if (!sym) return;
    let cancelled = false;
    getDetails(sym).then((d) => !cancelled && setDetails(d)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sym]);
  const quote = quotes.data[sym];
  // Stats from the details call fill any gaps in the quote (the mock provider puts them on the quote directly).
  const q = quote && {
    ...quote,
    name: details.name ?? quote.name,
    exchange: details.exchange ?? quote.exchange,
    fiftyTwoWeekHigh: details.fiftyTwoWeekHigh ?? quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: details.fiftyTwoWeekLow ?? quote.fiftyTwoWeekLow,
    dividendYield: details.dividendYield ?? quote.dividendYield,
    marketCap: details.marketCap ?? quote.marketCap,
    trailingPE: details.trailingPE ?? quote.trailingPE,
  };
  const history = histories.data[0];

  const view = useMemo(() => {
    if (!history?.dates.length) return null;
    const last = history.dates[history.dates.length - 1];
    const cutoff = range ? `${Number(last.slice(0, 4)) - range}${last.slice(4)}` : '';
    const start = cutoff ? history.dates.findIndex((d) => d >= cutoff) : 0;
    const dates = history.dates.slice(start);
    const closes = history.closes.slice(start);
    // Thin dense (daily) data so long ranges stay fast to draw.
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
    <>
      <div className="stack">
        <h1>Research</h1>
        <div style={{ maxWidth: 640, display: 'flex' }}>
          <SymbolSearch large onSelect={(r) => navigate(`/research/${encodeURIComponent(r.symbol)}`)} placeholder="Look up a stock, ETF, bond fund…" />
        </div>
        <p className="small muted" style={{ maxWidth: 760 }}>
          Search for anything to see its price history and how risky it has been. Bonds are easiest to explore through bond funds and
          ETFs such as BND, AGG, TLT, or SGOV (short-term Treasuries).
        </p>
      </div>
      {sym && (
        <section className="card" aria-labelledby="sym-h" style={{ gap: 24 }}>
          <div className="page-head">
            <div className="titles">
              <div className="row" style={{ gap: 10 }}>
                <h2 id="sym-h" style={{ fontSize: 30, lineHeight: '36px' }}>{sym}</h2>
                <span className="tag" style={{ fontSize: 12, lineHeight: '16px', padding: '2px 8px' }}>{typeLabel(q?.type)}</span>
              </div>
              <span className="small muted">{[q?.name !== sym ? q?.name : '', q?.exchange].filter(Boolean).join(' · ')}</span>
            </div>
            {q && (
              <div className="figure">
                <span className="big-number">{moneyExact(q.price)}</span>
                {q.changePercent !== undefined && (
                  <GainBadge value={q.changePercent}>{pctSigned(q.changePercent / 100, 2)} today</GainBadge>
                )}
              </div>
            )}
          </div>
          {quotes.error && <p className="error">{quotes.error}</p>}
          {q && (
            <div className="tiles">
              <Tile label="52-week range" value={q.fiftyTwoWeekLow ? `${moneyExact(q.fiftyTwoWeekLow)} – ${moneyExact(q.fiftyTwoWeekHigh ?? NaN)}` : '—'} />
              <Tile label="Dividend yield" value={q.dividendYield ? pct(q.dividendYield, 2) : '—'} />
              <Tile label="Market cap" value={q.marketCap ? moneyCompact(q.marketCap) : '—'} />
              <Tile label="P/E ratio" value={q.trailingPE ? q.trailingPE.toFixed(1) : '—'} />
            </div>
          )}

          <div className="segmented" role="radiogroup" aria-label="History length">
            {RANGES.map(([label, years]) => (
              <button key={label} role="radio" aria-checked={range === years} className={range === years ? 'active' : ''} onClick={() => setRange(years)}>
                {label}
              </button>
            ))}
          </div>
          {histories.loading && <p className="muted small">Loading history…</p>}
          {histories.error && <p className="error">{histories.error}</p>}
          {view && (
            <>
              <div className="stack" style={{ gap: 12 }}>
                <AreaValueChart
                  data={view.data.map((d) => ({ date: monthLabel(d.date.slice(0, 7)), close: d.close }))}
                  xKey="date"
                  valueKey="close"
                  label="Adjusted price"
                  height={308}
                />
                <p className="xsmall muted">
                  {view.years.toFixed(1)} years of month-end prices, from {monthLabel(view.from.slice(0, 7))}. Adjusted for dividends and
                  splits, so the chart shows total return.
                </p>
              </div>
              {view.stats.months >= 12 && <StatGrid stats={view.stats} />}
            </>
          )}
        </section>
      )}
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="label">{label}</span>
      <span className={`value${value === '—' ? ' muted' : ''}`}>{value}</span>
    </div>
  );
}
