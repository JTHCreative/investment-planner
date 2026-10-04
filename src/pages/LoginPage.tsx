import { Capacitor } from '@capacitor/core';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { useState, type FormEvent } from 'react';
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
      <div className="card login-card">
        <h1>Investment Planner</h1>
        <p className="muted">Practice investing with pretend money and real market data.</p>
        <form onSubmit={submit} className="stack">
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
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
          {info && <p className="muted">{info}</p>}
          <button className="primary" disabled={busy}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        {/* Google's popup flow only works in a browser; the native apps use email sign-in. */}
        {!Capacitor.isNativePlatform() && (
          <button disabled={busy} onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
            Continue with Google
          </button>
        )}
        <div className="row spread small">
          <button className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>
          {mode === 'signin' && (
            <button
              className="link"
              disabled={!email}
              onClick={() => run(async () => {
                await sendPasswordResetEmail(auth, email);
                setInfo('Password reset email sent.');
              })}
            >
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
