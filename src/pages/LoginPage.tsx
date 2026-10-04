import { Capacitor } from '@capacitor/core';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { LogoIcon } from '../components/Icons';
import { auth } from '../firebase';
import { errorMessage } from '../lib/market';

export function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err).replace('Firebase: ', ''));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    run(() =>
      mode === 'signin'
        ? signInWithEmailAndPassword(auth, email, password)
        : createUserWithEmailAndPassword(auth, email, password),
    );
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="stack">
          <span className="brand-mark lg"><LogoIcon size={22} /></span>
          <div className="stack gap-sm" style={{ gap: 8 }}>
            <h1 style={{ fontSize: 30, lineHeight: '36px' }}>Investment Planner</h1>
            <p className="muted" style={{ lineHeight: '24px' }}>Practice investing with pretend money and real market data.</p>
          </div>
        </div>
        <form onSubmit={submit} className="stack">
          <label className="field">
            Email
            <input type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="error">{error}</p>}
          {info && <p className="muted small">{info}</p>}
          <button className="btn primary block" disabled={busy} style={{ marginTop: 4 }}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        {/* Google's popup flow only works in a browser; the native apps use email sign-in. */}
        {!Capacitor.isNativePlatform() && (
          <>
            <div className="or">or</div>
            <button className="btn block" disabled={busy} onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
              Continue with Google
            </button>
          </>
        )}
        <div className="row spread wrap small" style={{ gap: 8 }}>
          <button className="link-btn" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>
          {mode === 'signin' && (
            <button
              className="link-btn"
              disabled={!email}
              onClick={() =>
                run(async () => {
                  await sendPasswordResetEmail(auth, email);
                  setInfo('Password reset email sent.');
                })
              }
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
      <p className="footer" style={{ maxWidth: 420, padding: 0 }}>Simulated money only. Market data may be delayed. Nothing here is financial advice.</p>
    </div>
  );
}
