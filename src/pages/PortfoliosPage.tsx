import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../auth/AuthProvider';
import { createPortfolio } from '../lib/db';
import { money, pct } from '../lib/format';
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
    <div className="stack">
      <div className="row spread">
        <h1>Your portfolios</h1>
        <div className="row gap-sm">
          {portfolios.data.length > 1 && <Link className="button" to="/compare">Compare</Link>}
          <button className="primary" onClick={() => setShowCreate(true)}>New portfolio</button>
        </div>
      </div>
      <p className="muted">
        Each portfolio is a pretend account with pretend money. Try different mixes side by side to see which one fits you.
      </p>

      {(showCreate || (!portfolios.loading && portfolios.data.length === 0)) && (
        <CreatePortfolio onCancel={portfolios.data.length ? () => setShowCreate(false) : undefined} />
      )}

      {portfolios.error && <p className="error">{portfolios.error}</p>}
      {portfolios.loading && <p className="muted">Loading…</p>}

      <div className="grid">
        {portfolios.data.map((p) => {
          const pending = Object.keys(p.holdings ?? {}).some((s) => !(s in prices));
          const value = totalValue(p, prices);
          const gain = value / p.startingCash - 1;
          return (
            <Link key={p.id} to={`/p/${p.id}`} className="card portfolio-card">
              <h2>{p.name}</h2>
              {p.description && <p className="muted small truncate">{p.description}</p>}
              <div className="headline-value">{pending ? '…' : money(value)}</div>
              <div className={`small ${gain >= 0 ? 'gain' : 'loss'}`}>
                {pending ? '' : `${pct(gain, 2, true)} since start (${money(p.startingCash)})`}
              </div>
              <div className="muted small">
                {p.targets.length
                  ? p.targets.map((t) => `${t.symbol} ${pct(t.weight, 0)}`).join(' · ')
                  : 'No plan yet'}
              </div>
            </Link>
          );
        })}
      </div>
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
    <form className="card stack" onSubmit={submit}>
      <h2>New portfolio</h2>
      <div className="controls">
        <label>
          Name
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Pretend starting cash
          <input type="number" min={1} step="any" required value={cash} onChange={(e) => setCash(Number(e.target.value))} />
        </label>
        <label>
          Starting mix
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="">Blank, I’ll pick investments</option>
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name}: {p.description}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row gap-sm">
        <button className="primary" disabled={busy || !(cash > 0)}>Create</button>
        {onCancel && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
