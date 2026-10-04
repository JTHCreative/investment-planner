import { useState, type FormEvent } from 'react';
import { useUser } from '../auth/AuthProvider';
import { saveApiKeys } from '../lib/db';
import { errorMessage, type ApiKeys } from '../lib/market';

export function SettingsPage({ current }: { current: Partial<ApiKeys> }) {
  const user = useUser();
  const [finnhub, setFinnhub] = useState(current.finnhub ?? '');
  const [alphaVantage, setAlphaVantage] = useState(current.alphaVantage ?? '');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      await saveApiKeys(user.uid, { finnhub, alphaVantage });
      setStatus('Saved.');
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1>Settings</h1>
      <form className="card stack" onSubmit={submit}>
        <h2>Market data keys</h2>
        <p className="muted">
          Prices come from two services with free plans. Each takes a minute to sign up for, and you paste the key here. Keys are saved
          to your account, so they work on every device you sign in on.
        </p>
        <label>
          Finnhub API key: live prices and search (free: 60 requests a minute)
          <input value={finnhub} onChange={(e) => setFinnhub(e.target.value)} autoComplete="off" spellCheck={false} placeholder="e.g. cq1abc2def…" />
        </label>
        <p className="small">
          Get one at <a href="https://finnhub.io/register" target="_blank" rel="noreferrer">finnhub.io/register</a>. The key is on your dashboard after sign-up.
        </p>
        <label>
          Alpha Vantage API key: price history for backtests and projections (free: 25 downloads a day)
          <input value={alphaVantage} onChange={(e) => setAlphaVantage(e.target.value)} autoComplete="off" spellCheck={false} placeholder="e.g. ABCD1234EFGH5678" />
        </label>
        <p className="small">
          Get one at <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer">alphavantage.co/support/#api-key</a>.
          Each symbol’s history is downloaded once and shared through the app’s cache, so 25 a day goes a long way.
        </p>
        <div className="row gap-sm">
          <button className="primary" disabled={busy}>Save keys</button>
          {status && <span className={status === 'Saved.' ? 'gain' : 'error'}>{status}</span>}
        </div>
        <p className="muted small">
          Free keys are low-stakes, but they do travel from your browser to these services, so use free-tier keys here rather than paid ones.
        </p>
      </form>
    </div>
  );
}
