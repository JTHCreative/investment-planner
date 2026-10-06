import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUser } from '../auth/AuthProvider';
import { AllocationEditor } from '../components/AllocationEditor';
import { BacktestPanel, ProjectionPanel } from '../components/Analysis';
import { AreaValueChart, ChartLegend } from '../components/Charts';
import { DuplicateButton } from '../components/DuplicateDialog';
import { ShareDialog } from '../components/ShareDialog';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BackIcon,
  ChevronIcon,
  GainBadge,
  EyeIcon,
  RefreshIcon,
  ShareIcon,
  SignOutIcon,
  TrashIcon,
  WalletIcon,
} from '../components/Icons';
import { typeLabel } from '../components/SymbolSearch';
import {
  deletePortfolio,
  leavePortfolio,
  executeTrades,
  moveCash,
  saveTargets,
  updatePortfolioInfo,
  watchRevisions,
  watchTransactions,
} from '../lib/db';
import { date, monthLabel, moneyExact, pct, pctSigned, shares, signedMoney } from '../lib/format';
import { useHistories, usePortfolio, useQuotes, useUsername } from '../lib/hooks';
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

/** Holdings and plan slices share colors: the plan's order first, then anything held but not in the plan. */
function colorMap(p: Portfolio): Map<string, string> {
  const order = [...p.targets.map((t) => t.symbol), ...Object.keys(p.holdings ?? {})];
  const map = new Map<string, string>();
  for (const s of order) if (!map.has(s)) map.set(s, `var(--series-${(map.size % 6) + 1})`);
  return map;
}

/** What the signed-in person may do with the open portfolio. */
interface Access {
  isOwner: boolean;
  canEdit: boolean;
}
const AccessContext = createContext<Access>({ isOwner: true, canEdit: true });
const useAccess = () => useContext(AccessContext);

export function PortfolioPage() {
  // Your own portfolios are at /p/:id; ones shared with you at /s/:owner/:id.
  const { id = '', owner } = useParams();
  const user = useUser();
  const portfolio = usePortfolio(owner ?? user.uid, id);
  const [sharing, setSharing] = useState(false);
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
  if (!p)
    return (
      <p>
        {owner && owner !== user.uid ? 'This portfolio isn’t shared with you, or it was deleted.' : 'Portfolio not found.'}{' '}
        <Link to="/">Back to portfolios</Link>
      </p>
    );
  const isOwner = p.ownerId === user.uid;
  const access: Access = { isOwner, canEdit: isOwner || p.members?.[user.uid] === 'edit' };

  const prices = Object.fromEntries(Object.values(quotes.data).map((q) => [q.symbol, q.price]));
  const pricesReady = Object.keys(p.holdings ?? {}).every((s) => s in prices);
  const value = totalValue(p, prices);
  const gain = value - p.startingCash;

  return (
    <AccessContext.Provider value={access}>
      <div className="row spread" style={{ marginBottom: -8 }}>
        <Link to="/" className="back-link" style={{ marginBottom: 0 }}>
          <BackIcon />
          Back to portfolios
        </Link>
        <div className="actions">
          {isOwner && (
            <button className="btn sm" onClick={() => setSharing(true)}>
              <ShareIcon size={16} />
              Share
            </button>
          )}
          <DuplicateButton portfolio={p} className="btn sm" />
        </div>
      </div>
      {!isOwner && <SharedBanner p={p} canEdit={access.canEdit} />}
      {sharing && <ShareDialog portfolio={p} onClose={() => setSharing(false)} />}
      <div className="page-head">
        <div className="titles">
          <h1>{p.name}</h1>
          {p.description && <p className="subtitle">{p.description}</p>}
        </div>
        <div className="figure">
          <span className="big-number">{pricesReady ? moneyExact(value) : '…'}</span>
          {pricesReady && (
            <GainBadge value={gain}>
              {signedMoney(gain)} ({pctSigned(gain / p.startingCash, 2)})
            </GainBadge>
          )}
        </div>
      </div>
      {quotes.error && <p className="error">Live prices unavailable: {quotes.error}</p>}

      <div className="tabs" role="tablist" aria-label="Portfolio sections">
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
      </div>

      {tab === 'overview' && <Overview p={p} quotes={quotes.data} pricesReady={pricesReady} />}
      {tab === 'plan' && <PlanTab p={p} amount={pricesReady && value > 0 ? value : p.startingCash} />}
      {tab === 'backtest' && <AnalysisTab p={p} prices={prices} kind="backtest" />}
      {tab === 'projection' && <AnalysisTab p={p} prices={prices} kind="projection" />}
      {tab === 'activity' && <Activity p={p} />}
    </AccessContext.Provider>
  );
}

/** On someone else's portfolio: whose it is, what you can do, and a way to stop seeing it. */
function SharedBanner({ p, canEdit }: { p: Portfolio; canEdit: boolean }) {
  const user = useUser();
  const navigate = useNavigate();
  const owner = useUsername(p.ownerId);
  const [error, setError] = useState('');
  return (
    <div className="notice">
      {canEdit ? <ShareIcon size={20} /> : <EyeIcon size={20} />}
      <p>
        Shared with you{owner ? ` by @${owner}` : ''}.{' '}
        {canEdit ? 'You can trade and change the plan; only they can share or delete it.' : 'You can look, but not make changes.'}
        {error && <span className="error"> {error}</span>}
      </p>
      <button
        className="btn sm"
        onClick={() =>
          confirm(`Stop seeing “${p.name}”? Its owner can share it with you again.`) &&
          leavePortfolio(p.ownerId, p.id, user.uid).then(
            () => navigate('/'),
            (e) => setError(errorMessage(e)),
          )
        }
      >
        <SignOutIcon size={16} />
        Leave
      </button>
    </div>
  );
}

function StatCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat-card">
      <span className="label">{label}</span>
      <span className="value">{children}</span>
    </div>
  );
}

function Overview({ p, quotes, pricesReady }: { p: Portfolio; quotes: Record<string, Quote>; pricesReady: boolean }) {
  const { canEdit } = useAccess();
  const prices = Object.fromEntries(Object.values(quotes).map((q) => [q.symbol, q.price]));
  const total = totalValue(p, prices);
  const invested = holdingsValue(p.holdings ?? {}, prices);
  const targetBySymbol = new Map(p.targets.map((t) => [t.symbol, t.weight]));
  const colors = colorMap(p);
  const plannedCash = Math.max(0, 1 - p.targets.reduce((a, t) => a + t.weight, 0));
  const rows = Object.entries(p.holdings ?? {}).sort(
    ([a, ha], [b, hb]) => hb.shares * (prices[b] ?? 0) - ha.shares * (prices[a] ?? 0),
  );
  const updated = Math.max(0, ...Object.values(quotes).map((q) => q.updatedAt ?? 0));

  return (
    <>
      <div className="stat-cards">
        <StatCard label="Invested">{pricesReady ? moneyExact(invested) : '…'}</StatCard>
        <StatCard label="Cash">{moneyExact(p.cash)}</StatCard>
        <StatCard label="Started with">{moneyExact(p.startingCash)}</StatCard>
        <StatCard label="Opened">{date(p.createdAt)}</StatCard>
      </div>

      {rows.length === 0 ? (
        <section className="card">
          <div className="card-head">
            <h2>Nothing is invested yet</h2>
            <p className="muted small">Pick a mix of investments, then buy them with your pretend cash at today’s prices.</p>
          </div>
          {canEdit && (
            <div className="actions">
              <Link className="btn primary" to="?tab=plan">Choose how to invest</Link>
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="card flush" aria-labelledby="hold-h">
            <div className="card-head inline" style={{ alignItems: 'center' }}>
              <h3 id="hold-h">Holdings</h3>
              {updated > 0 && (
                <span className="row xsmall muted" style={{ gap: 6 }}>
                  <RefreshIcon size={14} />
                  Updated {new Date(updated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
            </div>
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
                          <div className="holding">
                            <span className="swatch" style={{ background: colors.get(symbol) }} />
                            <div>
                              <span className="sym">
                                <Link to={`/research/${encodeURIComponent(symbol)}`}>{symbol}</Link>
                                <span className="tag">{typeLabel(q?.type || target?.type)}</span>
                              </span>
                              {name && <span className="sub truncate">{name}</span>}
                            </div>
                          </div>
                        </td>
                        <td className="num">{shares(h.shares)}</td>
                        <td className="num">
                          <div>{q ? moneyExact(q.price) : '…'}</div>
                          {q?.changePercent !== undefined && (
                            <div className="sub">
                              {q.changePercent >= 0 ? '▲' : '▼'} {pctSigned(q.changePercent / 100, 2)} today
                            </div>
                          )}
                        </td>
                        <td className="num">{moneyExact(v)}</td>
                        <td className="num">
                          <div>{signedMoney(gain)}</div>
                          <div className="sub">{pctSigned(gain / h.costBasis, 1)}</div>
                        </td>
                        <td className="num">
                          {pct(v / total)} <span className="muted">/ plan {pct(targetBySymbol.get(symbol) ?? 0, 0)}</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td>
                      <div className="holding">
                        <span className="swatch" style={{ background: 'var(--cash)' }} />
                        <span style={{ fontSize: 16 }}>Cash</span>
                      </div>
                    </td>
                    <td className="num muted">—</td>
                    <td className="num muted">—</td>
                    <td className="num">{moneyExact(p.cash)}</td>
                    <td className="num muted">—</td>
                    <td className="num">
                      {pct(p.cash / total)} <span className="muted">/ plan {pct(plannedCash, 0)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="table-note">
              Live prices refresh every minute. Gains are price changes only; dividends are counted in the performance chart, backtests and projections.
            </p>
          </section>
          <PerformanceChart p={p} quotes={quotes} />
        </>
      )}
    </>
  );
}

function PerformanceChart({ p, quotes }: { p: Portfolio; quotes: Record<string, Quote> }) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  useEffect(() => watchTransactions(p.ownerId, p.id, setTxs), [p.ownerId, p.id]);
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

  const range =
    points.length > 1 ? `${monthLabel(points[0].date.slice(0, 7))} – ${monthLabel(points[points.length - 1].date.slice(0, 7))}` : '';

  return (
    <section className="card" aria-labelledby="perf-h">
      <div className="card-head inline">
        <h3 id="perf-h">Value since opened</h3>
        {range && <span className="small muted">{range}</span>}
      </div>
      {histories.loading ? (
        <p className="muted small">Loading performance…</p>
      ) : histories.error ? (
        <p className="error">{histories.error}</p>
      ) : points.length < 2 ? (
        <p className="muted small">The chart fills in as prices change.</p>
      ) : (
        <>
          <AreaValueChart
            data={points.map((pt) => ({ date: pt.date, value: pt.value }))}
            xKey="date"
            valueKey="value"
            label="Portfolio value"
            baseline={p.startingCash}
            baselineLabel="Starting cash"
          />
          <ChartLegend
            items={[
              { label: 'Portfolio value', color: 'var(--line)' },
              { label: 'Starting cash', color: 'var(--text-faint)', kind: 'dash' },
            ]}
          />
        </>
      )}
    </section>
  );
}

function CashAndSettings({ p }: { p: Portfolio }) {
  const navigate = useNavigate();
  const { isOwner, canEdit } = useAccess();
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

  if (!canEdit) return null;
  return (
    <details className="panel" open>
      <summary>
        <ChevronIcon size={20} />
        Cash &amp; settings
      </summary>
      <div className="panel-body">
        <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '0 1 200px' }}>
            Amount
            <span className="affix has-pre">
              <span className="pre">$</span>
              <input type="number" min={0} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </span>
          </label>
          <button className="btn" onClick={() => run(() => moveCash(p.ownerId, p.id, amount))}>Add pretend cash</button>
          <button className="btn" onClick={() => run(() => moveCash(p.ownerId, p.id, -amount))}>Withdraw</button>
        </div>
        <div className="divider" />
        <div className="row wrap" style={{ gap: 12, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 220px' }}>
            Name
            <input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field" style={{ flex: '3 1 320px' }}>
            Notes
            <input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <button
            className="btn"
            disabled={!name.trim()}
            onClick={() => run(() => updatePortfolioInfo(p.ownerId, p.id, { name: name.trim(), description }))}
          >
            Save
          </button>
        </div>
        <div className="divider" />
        <div className="actions">
          <DuplicateButton portfolio={p} className="btn" />
          {isOwner && (
          <button
            className="btn danger"
            onClick={() =>
              confirm(`Delete "${p.name}" and its history? This can’t be undone.`) &&
              run(async () => {
                await deletePortfolio(p.ownerId, p.id);
                navigate('/');
              })
            }
          >
            <TrashIcon />
            Delete portfolio
          </button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </details>
  );
}

function PlanTab({ p, amount }: { p: Portfolio; amount: number }) {
  const { canEdit } = useAccess();
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
      await saveTargets(p.ownerId, p.id, draft, note);
      setNote('');
      setMessage('Plan saved.');
    });

  const preview = () =>
    run(async () => {
      if (dirty) await saveTargets(p.ownerId, p.id, draft, note);
      const symbols = [...new Set([...Object.keys(p.holdings ?? {}), ...draft.map((t) => t.symbol)])];
      const fresh = await getQuotes(symbols);
      const prices = Object.fromEntries(Object.values(fresh).map((q) => [q.symbol, q.price]));
      setTrades(planRebalance({ cash: p.cash, holdings: p.holdings ?? {} }, draft, prices));
    });

  const execute = () =>
    run(async () => {
      await executeTrades(p.ownerId, p.id, trades!, note || 'Rebalance to plan');
      setTrades(null);
      setNote('');
      setMessage('Done. Your pretend portfolio now matches the plan.');
    });

  const sells = trades?.filter((t) => t.side === 'sell').reduce((a, t) => a + t.amount, 0) ?? 0;
  const buys = trades?.filter((t) => t.side === 'buy').reduce((a, t) => a + t.amount, 0) ?? 0;
  const cashUsed = Math.max(0, buys - sells);

  return (
    <>
      <section className="card" aria-labelledby="plan-h" style={{ gap: 24 }}>
        <div className="card-head">
          <h2 id="plan-h">Target mix</h2>
          <p className="muted small">
            Decide what share of the money goes where. You can change this any time; each saved version is kept under Activity.
          </p>
        </div>
        {/* A disabled fieldset turns every control inside it off, so viewers see the plan exactly as editors do. */}
        <fieldset className="bare-fieldset" disabled={!canEdit}>
          <AllocationEditor targets={draft} amount={amount} onChange={(t) => { setDraft(t); setTrades(null); }} />
        </fieldset>
        {canEdit ? (
          <label className="field">
            Note
            <input maxLength={200} value={note} placeholder="Why this plan? (optional)" onChange={(e) => setNote(e.target.value)} />
          </label>
        ) : (
          <p className="muted small">You have view access, so the plan can’t be changed here. Duplicate it to try your own version.</p>
        )}
        {invalid && draft.length > 0 && <p className="error">{invalid}</p>}
        {canEdit && <div className="actions">
          <button className="btn" disabled={busy || !dirty || !!invalid} onClick={save}>Save plan</button>
          <button className="btn primary" disabled={busy || !!invalid || !draft.length} onClick={preview}>
            {Object.keys(p.holdings ?? {}).length ? 'Rebalance to this plan…' : 'Invest using this plan…'}
          </button>
          {dirty && <button className="btn ghost" onClick={() => setDraft(p.targets)}>Undo changes</button>}
          {message && <span className="badge badge-gain">{message}</span>}
        </div>}
        {error && <p className="error">{error}</p>}
      </section>

      {trades && (
        <section className="card ring" aria-labelledby="rev-h">
          <div className="card-head">
            <h2 id="rev-h">Review pretend trades</h2>
            <p className="muted small">
              {trades.length ? 'These trades bring the portfolio to your target mix using today’s prices.' : 'Already on plan, nothing to trade.'}
            </p>
          </div>
          {trades.length > 0 && (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Action</th><th>Symbol</th><th className="num">Shares</th><th className="num">Price</th><th className="num">Amount</th></tr>
                  </thead>
                  <tbody>
                    {trades.map((t) => (
                      <tr key={t.symbol + t.side}>
                        <td>
                          <span className={`badge sm ${t.side === 'buy' ? 'badge-buy' : ''}`}>
                            {t.side === 'buy' ? <ArrowDownIcon size={14} /> : <ArrowUpIcon size={14} />}
                            {t.side === 'buy' ? 'Buy' : 'Sell'}
                          </span>
                        </td>
                        <td>
                          {t.symbol} <span className="muted xsmall">{draft.find((d) => d.symbol === t.symbol)?.name ?? ''}</span>
                        </td>
                        <td className="num">{shares(t.shares)}</td>
                        <td className="num">{moneyExact(t.price)}</td>
                        <td className="num">{moneyExact(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="xsmall muted">
                {sells > 0 ? `Sells ${moneyExact(sells)}` : 'Sells nothing'}
                {cashUsed > 0 ? ` and uses ${moneyExact(cashUsed)} of cash.` : '.'} Uses the latest market prices, fractional shares, no fees or
                taxes. Nothing real is bought or sold.
              </p>
            </>
          )}
          <div className="actions">
            {trades.length > 0 && (
              <button className="btn primary" disabled={busy} onClick={execute}>Confirm trades</button>
            )}
            <button className="btn" disabled={busy} onClick={() => setTrades(null)}>{trades.length ? 'Cancel' : 'Close'}</button>
          </div>
        </section>
      )}
    </>
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
  const sourceControl = hasHoldings ? (
    <div className="segmented" role="radiogroup" aria-label="What to analyze">
      <button role="radio" aria-checked={source === 'plan'} className={source === 'plan' ? 'active' : ''} onClick={() => setSource('plan')}>
        Saved plan
      </button>
      <button role="radio" aria-checked={source === 'holdings'} className={source === 'holdings' ? 'active' : ''} onClick={() => setSource('holdings')}>
        Current holdings
      </button>
    </div>
  ) : null;

  return kind === 'backtest' ? (
    <BacktestPanel targets={targets} initial={initial} sourceControl={sourceControl} />
  ) : (
    <ProjectionPanel targets={targets} initial={initial} sourceControl={sourceControl} />
  );
}

const TX_BADGE: Record<Transaction['type'], { label: string; className: string; icon: ReactNode }> = {
  buy: { label: 'Buy', className: 'badge-buy', icon: <ArrowDownIcon size={14} /> },
  sell: { label: 'Sell', className: '', icon: <ArrowUpIcon size={14} /> },
  deposit: { label: 'Deposit', className: 'badge-quiet', icon: <WalletIcon size={14} /> },
  withdrawal: { label: 'Withdrawal', className: 'badge-quiet', icon: <WalletIcon size={14} /> },
};

function Activity({ p }: { p: Portfolio }) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  useEffect(() => watchTransactions(p.ownerId, p.id, setTxs), [p.ownerId, p.id]);
  useEffect(() => watchRevisions(p.ownerId, p.id, setRevisions), [p.ownerId, p.id]);

  return (
    <>
      <div className="row wrap" style={{ gap: 24, alignItems: 'flex-start' }}>
        <section className="card" aria-labelledby="ph-h" style={{ flex: '1 1 320px' }}>
          <h3 id="ph-h">Plan history</h3>
          {revisions.length === 0 ? (
            <p className="muted small">No saved plans yet.</p>
          ) : (
            <ol className="timeline">
              {revisions.map((r, i) => (
                <li key={r.id}>
                  <div className="rail">
                    <span className="dot" />
                    {i < revisions.length - 1 && <span className="line" />}
                  </div>
                  <div className="body">
                    <span className="xsmall muted">
                      {date(r.createdAt)}
                      {i === 0 ? ' · Current' : ''}
                    </span>
                    <span style={{ lineHeight: '24px' }}>
                      {r.targets.map((t) => `${t.symbol} ${pct(t.weight, 1)}`).join(' · ') || 'All cash'}
                    </span>
                    {r.note && <span className="small muted">“{r.note}”</span>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="card" aria-labelledby="tc-h" style={{ flex: '999 1 560px', padding: '24px 8px 8px', gap: 12 }}>
          <h3 id="tc-h" style={{ padding: '0 16px' }}>Trades &amp; cash</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Symbol</th><th className="num">Shares</th><th className="num">Price</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {txs.map((t) => {
                  const b = TX_BADGE[t.type];
                  return (
                    <tr key={t.id}>
                      <td>{date(t.at)}</td>
                      <td>
                        <span className={`badge sm ${b.className}`}>
                          {b.icon}
                          {b.label}
                        </span>
                      </td>
                      <td>{t.symbol ?? ''}</td>
                      <td className="num">{t.shares !== undefined ? shares(t.shares) : ''}</td>
                      <td className="num">{t.price !== undefined ? moneyExact(t.price) : ''}</td>
                      <td className="num">{moneyExact(t.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <CashAndSettings p={p} />
    </>
  );
}
