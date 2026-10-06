import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useUser } from '../auth/AuthProvider';
import { CheckIcon, ShieldIcon } from '../components/Icons';
import { claimUsername, saveApiKeys, USERNAME_PATTERN, normalizeUsername, watchUsername } from '../lib/db';
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
    <>
      <h1>Settings</h1>
      <UsernameCard />
      <form className="card" onSubmit={submit} style={{ maxWidth: 760, padding: 32, gap: 28 }}>
        <div className="card-head" style={{ gap: 8 }}>
          <h2>Market data keys</h2>
          <p className="muted" style={{ lineHeight: '24px' }}>
            Prices come from two services with free plans. Each takes a minute to sign up for, and you paste the key here. Keys are saved
            to your account, so they work on every device you sign in on.
          </p>
        </div>

        <KeyField
          title="Finnhub API key"
          detail="Live prices and search (free: 60 requests a minute)"
          value={finnhub}
          onChange={setFinnhub}
          placeholder="e.g. cq1abc2def…"
          help={<>Get one at <a href="https://finnhub.io/register" target="_blank" rel="noreferrer">finnhub.io/register</a>. The key is on your dashboard after sign-up.</>}
        />
        <KeyField
          title="Alpha Vantage API key"
          detail="Price history for backtests and projections (free: 25 downloads a day)"
          value={alphaVantage}
          onChange={setAlphaVantage}
          placeholder="e.g. ABCD1234EFGH5678"
          help={
            <>
              Get one at <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer">alphavantage.co/support/#api-key</a>.
              Each symbol’s history is downloaded once and shared through the app’s cache, so 25 a day goes a long way.
            </>
          }
        />

        <div className="actions" style={{ gap: 16 }}>
          <button className="btn primary" disabled={busy} style={{ padding: '0 20px' }}>Save keys</button>
          {status === 'Saved.' ? (
            <span className="badge badge-gain">
              <CheckIcon size={14} />
              Saved.
            </span>
          ) : (
            status && <span className="error">{status}</span>
          )}
        </div>

        <div className="note-box">
          <ShieldIcon size={18} />
          <p>Free keys are low-stakes, but they do travel from your browser to these services, so use free-tier keys here rather than paid ones.</p>
        </div>
      </form>
    </>
  );
}

function KeyField({
  title,
  detail,
  value,
  onChange,
  placeholder,
  help,
}: {
  title: string;
  detail: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  help: ReactNode;
}) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      <label className="stack" style={{ gap: 10 }}>
        <span className="stack" style={{ gap: 2 }}>
          <span>{title}</span>
          <span className="small muted">{detail}</span>
        </span>
        <span className="affix">
          <input
            className="mono"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            style={{ paddingRight: 44 }}
          />
          {value.trim() && (
            <span className="ok" aria-label="Key entered">
              <CheckIcon size={18} />
            </span>
          )}
        </span>
      </label>
      <p className="xsmall muted">{help}</p>
    </div>
  );
}

/** The name other people type to share a portfolio with you. */
function UsernameCard() {
  const user = useUser();
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(
    () =>
      watchUsername(user.uid, (name) => {
        setCurrent(name);
        setDraft((d) => d || name || '');
      }),
    [user.uid],
  );
  const clean = normalizeUsername(draft);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      await claimUsername(user.uid, clean, current ?? null);
      setStatus('Saved.');
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ maxWidth: 760, padding: 32, gap: 20 }}>
      <div className="card-head" style={{ gap: 8 }}>
        <h2>Username</h2>
        <p className="muted" style={{ lineHeight: '24px' }}>
          People type this to share a portfolio with you, and it’s shown to others who can see a portfolio you share.
        </p>
      </div>
      <label className="field" style={{ maxWidth: 360 }}>
        Username
        <span className="affix has-pre">
          <span className="pre">@</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. alex_saves" autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={21} />
        </span>
      </label>
      <p className="xsmall muted">3–20 lowercase letters, numbers or underscores.</p>
      <div className="actions" style={{ gap: 16 }}>
        <button className="btn primary" disabled={busy || !USERNAME_PATTERN.test(clean) || clean === current} style={{ padding: '0 20px' }}>
          {current ? 'Change username' : 'Save username'}
        </button>
        {status === 'Saved.' ? (
          <span className="badge badge-gain">
            <CheckIcon size={14} />
            Saved.
          </span>
        ) : (
          status && <span className="error">{status}</span>
        )}
      </div>
    </form>
  );
}
