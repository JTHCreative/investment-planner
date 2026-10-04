import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUser } from '../auth/AuthProvider';
import { AllocationEditor } from '../components/AllocationEditor';
import { DuplicateButton } from '../components/DuplicateDialog';
import { BacktestPanel, ProjectionPanel } from '../components/Analysis';
import { SERIES_COLORS, ValueLineChart } from '../components/Charts';
import { typeLabel } from '../components/SymbolSearch';
import {
  deletePortfolio,
  executeTrades,
  moveCash,
  saveTargets,
  updatePortfolioInfo,
  watchRevisions,
  watchTransactions,
} from '../lib/db';
import { date, money, moneyExact, pct, shares } from '../lib/format';
import { useHistories, usePortfolio, useQuotes } from '../lib/hooks';
import { errorMessage, getQuotes } from '../lib/market';
import { holdingsValue, planRebalance, totalValue, validateTargets } from '../lib/sim/rebalance';
import { isoDate, valueHistory } from '../lib/sim/valuation';
import type { Portfolio, Quote, Revision, Target, Trade, Transaction } from '../lib/types';

const TABS = [
  ['overview', 'Overview'],
  ['plan', 'Plan & invest'],
  ['backtest', 'Backtest'],
  ['projection', 'Projection'],
  ['activity', 'Activity'],
] as const;
type Tab = (typeof TABS)[number][0];

export function PortfolioPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const portfolio = usePortfolio(user.uid, id);
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overview';

  const p = portfolio.data;
  const symbols = useMemo(
    () => (p ? [...new Set([...Object.keys(p.holdings ?? {}), ...p.targets.map((t) => t.symbol)])] : []),
    [p],
  );
  const quotes = useQuotes(symbols);

  if (portfolio.loading) return <p className="muted">Loading…</p>;
  if (portfolio.error) return <p className="error">{portfolio.error}</p>;
  if (!p) return <p>Portfolio not found. <Link to="/">Back to portfolios</Link></p>;

  const prices = Object.fromEntries(Object.values(quotes.data).map((q) => [q.symbol, q.price]));
  const pricesReady = Object.keys(p.holdings ?? {}).every((s) => s in prices);
  const value = totalValue(p, prices);

  return (
    <div className="stack">
      <Link to="/" className="small">← All portfolios</Link>
      <header className="portfolio-header">
        <div>
          <h1>{p.name}</h1>
          {p.description && <p className="muted">{p.description}</p>}
        </div>
        <div className="headline">
          <DuplicateButton portfolio={p} className="small header-action" />
          <div className="headline-value">{pricesReady ? money(value) : '…'}</div>
          {pricesReady && (
            <div className={value >= p.startingCash ? 'gain' : 'loss'}>
              {money(value - p.startingCash)} ({pct(value / p.startingCash - 1, 2, true)})
            </div>
          )}
        </div>
      </header>
      {quotes.error && <p className="error">Live prices unavailable: {quotes.error}</p>}

      <nav className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setParams({ tab: key }, { replace: true })}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview p={p} quotes={quotes.data} pricesReady={pricesReady} />}
      {tab === 'plan' && <PlanTab p={p} amount={pricesReady && value > 0 ? value : p.startingCash} />}
      {tab === 'backtest' && <AnalysisTab p={p} prices={prices} kind="backtest" />}
      {tab === 'projection' && <AnalysisTab p={p} prices={prices} kind="projection" />}
      {tab === 'activity' && <Activity p={p} />}
    </div>
  );
}

function Overview({ p, quotes, pricesReady }: { p: Portfolio; quotes: Record<string, Quote>; pricesReady: boolean }) {
  const prices = Object.fromEntries(Object.values(quotes).map((q) => [q.symbol, q.price]));
  const total = totalValue(p, prices);
  const invested = holdingsValue(p.holdings ?? {}, prices);
  const targetBySymbol = new Map(p.targets.map((t) => [t.symbol, t.weight]));
  const rows = Object.entries(p.holdings ?? {}).sort(
    ([a, ha], [b, hb]) => hb.shares * (prices[b] ?? 0) - ha.shares * (prices[a] ?? 0),
  );

  return (
    <div className="stack">
      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Invested</div><div className="stat-value">{pricesReady ? money(invested) : '…'}</div></div>
        <div className="stat"><div className="stat-label">Cash</div><div className="stat-value">{money(p.cash)}</div></div>
        <div className="stat"><div className="stat-label">Started with</div><div className="stat-value">{money(p.startingCash)}</div></div>
        <div className="stat"><div className="stat-label">Opened</div><div className="stat-value">{date(p.createdAt)}</div></div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <p>Nothing is invested yet.</p>
          <Link className="button primary" to="?tab=plan">Choose how to invest</Link>
        </div>
      ) : (
        <>
          <PerformanceChart p={p} quotes={quotes} />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Holding</th>
                  <th className="num">Shares</th>
                  <th className="num">Price</th>
                  <th className="num">Value</th>
                  <th className="num">Gain</th>
                  <th className="num">Weight / plan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([symbol, h]) => {
                  const q = quotes[symbol];
                  const target = p.targets.find((t) => t.symbol === symbol);
                  // Live quotes may not carry a name; the plan remembers the one picked in search.
                  const name = q?.name && q.name !== symbol ? q.name : target?.name;
                  const v = h.shares * (q?.price ?? NaN);
                  const gain = v - h.costBasis;
                  return (
                    <tr key={symbol}>
                      <td>
                        <Link to={`/research/${encodeURIComponent(symbol)}`}><strong>{symbol}</strong></Link>{' '}
                        <span className="tag">{typeLabel(q?.type || target?.type)}</span>
                        <div className="muted small truncate">{name}</div>
                      </td>
                      <td className="num">{shares(h.shares)}</td>
                      <td className="num">
                        {q ? moneyExact(q.price) : '…'}
                        {q?.changePercent !== undefined && (
                          <div className={`small ${q.changePercent >= 0 ? 'gain' : 'loss'}`}>{pct(q.changePercent / 100, 2, true)} today</div>
                        )}
                      </td>
                      <td className="num">{money(v)}</td>
                      <td className={`num ${gain >= 0 ? 'gain' : 'loss'}`}>
                        {money(gain)}
                        <div className="small">{pct(gain / h.costBasis, 1, true)}</div>
                      </td>
                      <td className="num">
                        {pct(v / total)}
                        <div className="muted small">plan {pct(targetBySymbol.get(symbol) ?? 0)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Live prices refresh every minute. Gains are price changes only; dividends are counted in the performance chart, backtests and projections.
          </p>
        </>
      )}
      <CashAndSettings p={p} />
    </div>
  );
}

function PerformanceChart({ p, quotes }: { p: Portfolio; quotes: Record<string, Quote> }) {
  const user = useUser();
  const [txs, setTxs] = useState<Transaction[]>([]);
  useEffect(() => watchTransactions(user.uid, p.id, setTxs), [user.uid, p.id]);
  const traded = [...new Set(txs.filter((t) => t.symbol).map((t) => t.symbol!))];
  const histories = useHistories(traded);
  const points = useMemo(() => {
    if (!histories.data.length) return [];
    // History is month-end only, so add today's live price as the newest point.
    const today = isoDate(Date.now());
    const bySymbol = Object.fromEntries(
      histories.data.map((h) => {
        const live = quotes[h.symbol]?.price;
        const last = h.dates[h.dates.length - 1];
        return [h.symbol, live && last < today ? { ...h, dates: [...h.dates, today], closes: [...h.closes, live] } : h];
      }),
    );
    return valueHistory(txs, bySymbol, 0, today);
  }, [txs, histories.data, quotes]);

  if (histories.loading) return <p className="muted">Loading performance…</p>;
  if (points.length < 2) {
    return (
      <div className="card">
        <h3>Value since opened</h3>
        <p className="muted small">The chart fills in as prices change.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h3>Value since opened</h3>
      <ValueLineChart
        data={points.map((pt) => ({ date: pt.date, value: pt.value }))}
        xKey="date"
        series={[{ key: 'value', label: 'Portfolio value', color: SERIES_COLORS[0] }]}
        height={220}
      />
    </div>
  );
}

function CashAndSettings({ p }: { p: Portfolio }) {
  const user = useUser();
  const navigate = useNavigate();
  const [amount, setAmount] = useState(1000);
  const [name, setName] = useState(p.name);
  const [description, setDescription] = useState(p.description ?? '');
  const [error, setError] = useState('');

  async function run(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <details className="card">
      <summary>Cash & settings</summary>
      <div className="stack">
        <div className="controls">
          <label>
            Amount
            <input type="number" min={0} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </label>
          <button onClick={() => run(() => moveCash(user.uid, p.id, amount))}>Add pretend cash</button>
          <button onClick={() => run(() => moveCash(user.uid, p.id, -amount))}>Withdraw</button>
        </div>
        <div className="controls">
          <label>
            Name
            <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="grow">
            Notes
            <input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <button disabled={!name.trim()} onClick={() => run(() => updatePortfolioInfo(user.uid, p.id, { name: name.trim(), description }))}>
            Save
          </button>
        </div>
        <div className="row gap-sm wrap">
          <DuplicateButton portfolio={p} />
          <button
            className="danger"
            onClick={() =>
              confirm(`Delete "${p.name}" and its history? This can’t be undone.`) &&
              run(async () => {
                await deletePortfolio(user.uid, p.id);
                navigate('/');
              })
            }
          >
            Delete portfolio
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </details>
  );
}

function PlanTab({ p, amount }: { p: Portfolio; amount: number }) {
  const user = useUser();
  const [draft, setDraft] = useState<Target[]>(p.targets);
  const [note, setNote] = useState('');
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const dirty = JSON.stringify(draft.map((t) => [t.symbol, t.weight])) !== JSON.stringify(p.targets.map((t) => [t.symbol, t.weight]));
  const invalid = validateTargets(draft);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      await saveTargets(user.uid, p.id, draft, note);
      setNote('');
      setMessage('Plan saved.');
    });

  const preview = () =>
    run(async () => {
      if (dirty) await saveTargets(user.uid, p.id, draft, note);
      const symbols = [...new Set([...Object.keys(p.holdings ?? {}), ...draft.map((t) => t.symbol)])];
      const fresh = await getQuotes(symbols);
      const prices = Object.fromEntries(Object.values(fresh).map((q) => [q.symbol, q.price]));
      setTrades(planRebalance({ cash: p.cash, holdings: p.holdings ?? {} }, draft, prices));
    });

  const execute = () =>
    run(async () => {
      await executeTrades(user.uid, p.id, trades!, note || 'Rebalance to plan');
      setTrades(null);
      setNote('');
      setMessage('Done. Your pretend portfolio now matches the plan.');
    });

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Target mix</h2>
        <p className="muted small">
          Decide what share of the money goes where. You can change this any time; each saved version is kept under Activity.
        </p>
        <AllocationEditor targets={draft} amount={amount} onChange={(t) => { setDraft(t); setTrades(null); }} />
        <label>
          Note for this version (optional)
          <input maxLength={200} value={note} placeholder="e.g. More bonds after reading about sequence risk" onChange={(e) => setNote(e.target.value)} />
        </label>
        {invalid && draft.length > 0 && <p className="error">{invalid}</p>}
        <div className="row gap-sm wrap">
          <button disabled={busy || !dirty || !!invalid} onClick={save}>Save plan</button>
          <button className="primary" disabled={busy || !!invalid || !draft.length} onClick={preview}>
            {Object.keys(p.holdings ?? {}).length ? 'Rebalance to this plan…' : 'Invest using this plan…'}
          </button>
          {dirty && <button className="link" onClick={() => setDraft(p.targets)}>Undo changes</button>}
        </div>
        {message && <p className="gain">{message}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {trades && (
        <div className="card stack">
          <h2>Review pretend trades</h2>
          {trades.length === 0 ? (
            <p>Already on plan, nothing to trade.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Action</th><th>Symbol</th><th className="num">Shares</th><th className="num">Price</th><th className="num">Amount</th></tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.symbol + t.side}>
                        <td className={t.side === 'buy' ? 'gain' : 'loss'}>{t.side === 'buy' ? 'Buy' : 'Sell'}</td>
                        <td><strong>{t.symbol}</strong> <span className="muted small">{draft.find((d) => d.symbol === t.symbol)?.name ?? ''}</span></td>
                        <td className="num">{shares(t.shares)}</td>
                        <td className="num">{moneyExact(t.price)}</td>
                        <td className="num">{money(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted small">Uses the latest market prices. Fractional shares, no fees or taxes.</p>
              <div className="row gap-sm">
                <button className="primary" disabled={busy} onClick={execute}>Confirm trades</button>
                <button disabled={busy} onClick={() => setTrades(null)}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisTab({ p, prices, kind }: { p: Portfolio; prices: Record<string, number>; kind: 'backtest' | 'projection' }) {
  const hasHoldings = Object.keys(p.holdings ?? {}).length > 0;
  const [source, setSource] = useState<'plan' | 'holdings'>('plan');
  const value = totalValue(p, prices);

  const targets: Target[] = useMemo(() => {
    if (source === 'plan' || !hasHoldings || !(value > 0)) return p.targets;
    return Object.entries(p.holdings).map(([symbol, h]) => ({ symbol, weight: (h.shares * (prices[symbol] ?? 0)) / value }));
  }, [source, p, prices, value, hasHoldings]);

  const initial = hasHoldings && value > 0 ? value : p.startingCash;
  return (
    <div className="card stack">
      {hasHoldings && (
        <div className="segmented" role="radiogroup" aria-label="What to analyze">
          <button role="radio" aria-checked={source === 'plan'} className={source === 'plan' ? 'active' : ''} onClick={() => setSource('plan')}>
            Saved plan
          </button>
          <button role="radio" aria-checked={source === 'holdings'} className={source === 'holdings' ? 'active' : ''} onClick={() => setSource('holdings')}>
            Current holdings
          </button>
        </div>
      )}
      {kind === 'backtest' ? <BacktestPanel targets={targets} initial={initial} /> : <ProjectionPanel targets={targets} initial={initial} />}
    </div>
  );
}

function Activity({ p }: { p: Portfolio }) {
  const user = useUser();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  useEffect(() => watchTransactions(user.uid, p.id, setTxs), [user.uid, p.id]);
  useEffect(() => watchRevisions(user.uid, p.id, setRevisions), [user.uid, p.id]);

  return (
    <div className="stack">
      <div className="card">
        <h2>Plan history</h2>
        {revisions.length === 0 && <p className="muted">No saved plans yet.</p>}
        <ul className="timeline">
          {revisions.map((r) => (
            <li key={r.id}>
              <div className="muted small">{date(r.createdAt)}</div>
              <div>{r.targets.map((t) => `${t.symbol} ${pct(t.weight, 1)}`).join(' · ') || 'All cash'}</div>
              {r.note && <div className="small">“{r.note}”</div>}
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>Trades & cash</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Type</th><th>Symbol</th><th className="num">Shares</th><th className="num">Price</th><th className="num">Amount</th></tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id}>
                  <td>{date(t.at)}</td>
                  <td className="capitalize">{t.type}</td>
                  <td>{t.symbol ?? ''}</td>
                  <td className="num">{t.shares !== undefined ? shares(t.shares) : ''}</td>
                  <td className="num">{t.price !== undefined ? moneyExact(t.price) : ''}</td>
                  <td className="num">{money(t.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
