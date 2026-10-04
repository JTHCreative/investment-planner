import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../auth/AuthProvider';
import { DuplicateButton } from '../components/DuplicateDialog';
import { BarsIcon, GainBadge, PlusIcon } from '../components/Icons';
import { createPortfolio } from '../lib/db';
import { moneyExact, pct, signedMoney } from '../lib/format';
import { usePortfolios, useQuotes } from '../lib/hooks';
import { errorMessage } from '../lib/market';
import { PRESETS } from '../lib/presets';
import { totalValue } from '../lib/sim/rebalance';

export function PortfoliosPage() {
  const user = useUser();
  const portfolios = usePortfolios(user.uid);
  const symbols = portfolios.data.flatMap((p) => Object.keys(p.holdings ?? {}));
  const quotes = useQuotes(symbols);
  const prices = Object.fromEntries(Object.values(quotes.data).map((q) => [q.symbol, q.price]));
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="stack-lg" style={{ gap: 32 }}>
      <section className="stack-lg">
        <div className="page-head">
          <div className="titles">
            <h1>Your portfolios</h1>
            <p className="subtitle">
              Each portfolio is a pretend account with pretend money. Try different mixes side by side to see which one fits you.
            </p>
          </div>
          <div className="actions">
            {portfolios.data.length > 1 && (
              <Link className="btn" to="/compare">
                <BarsIcon />
                Compare
              </Link>
            )}
            <button className="btn primary" onClick={() => setShowCreate(true)}>
              <PlusIcon />
              New portfolio
            </button>
          </div>
        </div>

        {portfolios.error && <p className="error">{portfolios.error}</p>}
        {portfolios.loading && <p className="muted">Loading…</p>}

        <div className="portfolio-grid">
          {portfolios.data.map((p) => {
            const pending = Object.keys(p.holdings ?? {}).some((s) => !(s in prices));
            const value = totalValue(p, prices);
            const gain = value - p.startingCash;
            return (
              <div key={p.id} className="portfolio-card">
                <div className="stack" style={{ gap: 4 }}>
                  {/* The title link stretches over the whole card; the Duplicate button sits above it. */}
                  <Link to={`/p/${p.id}`} className="name stretched-link" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                    {p.name}
                  </Link>
                  {p.description && <span className="muted small truncate">{p.description}</span>}
                </div>
                <div className="stack" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <span className="value">{pending ? '…' : moneyExact(value)}</span>
                  {!pending && (
                    <GainBadge value={gain}>
                      {signedMoney(gain)} ({pct(gain / p.startingCash, 2, true)})
                    </GainBadge>
                  )}
                </div>
                <div className="stack" style={{ gap: 10 }}>
                  {p.targets.length > 0 && (
                    <div className="mix-bar" aria-hidden>
                      {p.targets.map((t, i) => (
                        <span key={t.symbol} style={{ flex: `${t.weight} 1 0`, background: `var(--series-${(i % 6) + 1})` }} />
                      ))}
                      {p.targets.reduce((a, t) => a + t.weight, 0) < 0.999 && (
                        <span style={{ flex: `${1 - p.targets.reduce((a, t) => a + t.weight, 0)} 1 0`, background: 'var(--cash)' }} />
                      )}
                    </div>
                  )}
                  <span className="xsmall muted">
                    {p.targets.length ? p.targets.map((t) => `${t.symbol} ${pct(t.weight, 0)}`).join(' · ') : 'No plan yet'}
                  </span>
                </div>
                <DuplicateButton portfolio={p} className="btn sm card-action" />
              </div>
            );
          })}
        </div>
      </section>

      {(showCreate || (!portfolios.loading && portfolios.data.length === 0)) && (
        <CreatePortfolio onCancel={portfolios.data.length ? () => setShowCreate(false) : undefined} />
      )}
    </div>
  );
}

function CreatePortfolio({ onCancel }: { onCancel?: () => void }) {
  const user = useUser();
  const navigate = useNavigate();
  const [name, setName] = useState('My $100k plan');
  const [cash, setCash] = useState(100_000);
  const [preset, setPreset] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const chosen = PRESETS.find((p) => p.name === preset);
      const id = await createPortfolio(user.uid, {
        name: name.trim(),
        startingCash: cash,
        description: chosen ? `Started from the ${chosen.name} mix` : '',
        targets: chosen?.targets,
      });
      navigate(`/p/${id}?tab=plan`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="new-h">
      <div className="card-head">
        <h2 id="new-h">New portfolio</h2>
        <p className="muted small">Start empty, or pick a ready-made mix and tweak it later.</p>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          Name
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Starting cash
          <span className="affix has-pre">
            <span className="pre">$</span>
            <input type="number" min={1} step="any" required value={cash} onChange={(e) => setCash(Number(e.target.value))} />
          </span>
        </label>
        <label className="field">
          Start from
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="">Empty (all cash)</option>
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name} — {p.description}</option>
            ))}
          </select>
        </label>
        {error && <p className="error" style={{ gridColumn: '1 / -1' }}>{error}</p>}
        <div className="actions" style={{ gridColumn: '1 / -1' }}>
          <button className="btn primary" disabled={busy || !(cash > 0)}>Create portfolio</button>
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
        </div>
      </form>
    </section>
  );
}
