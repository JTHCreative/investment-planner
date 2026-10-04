import { signOut } from 'firebase/auth';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { auth } from './firebase';
import { ComparePage } from './pages/ComparePage';
import { LoginPage } from './pages/LoginPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { ResearchPage } from './pages/ResearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { watchApiKeys } from './lib/db';
import { historyCacheProblem, missingKeys, setUserApiKeys, subscribeMarket, type ApiKeys } from './lib/market';

function Shell() {
  const { user, loading } = useAuth();
  if (loading) return <div className="login muted">Loading…</div>;
  if (!user) return <LoginPage />;
  return <SignedIn uid={user.uid} email={user.email ?? ''} />;
}

function SignedIn({ uid, email }: { uid: string; email: string }) {
  // Load the user's market data keys before showing pages, so the first price requests use them.
  const [apiKeys, setApiKeys] = useState<Partial<ApiKeys> | null>(null);
  useEffect(
    () =>
      watchApiKeys(
        uid,
        (k) => {
          setUserApiKeys(k);
          setApiKeys(k);
        },
        () => setApiKeys({}),
      ),
    [uid],
  );
  const location = useLocation();
  const cacheProblem = useSyncExternalStore(subscribeMarket, historyCacheProblem);
  if (!apiKeys) return <div className="login muted">Loading…</div>;
  const missing = missingKeys();

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">Investment Planner</NavLink>
        <nav>
          <NavLink to="/" end>Portfolios</NavLink>
          <NavLink to="/compare">Compare</NavLink>
          <NavLink to="/research">Research</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <button className="link small" onClick={() => signOut(auth)} title={email}>Sign out</button>
      </header>
      <main>
        {missing.length > 0 && location.pathname !== '/settings' && (
          <div className="card notice">
            Live prices need free API keys from {missing.map((k) => (k === 'finnhub' ? 'Finnhub' : 'Alpha Vantage')).join(' and ')}.{' '}
            <Link to="/settings">Add them in Settings</Link>
          </div>
        )}
        {cacheProblem && <div className="card notice">{cacheProblem}</div>}
        <Routes>
          <Route path="/" element={<PortfoliosPage />} />
          <Route path="/p/:id" element={<PortfolioRoute />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/research/:symbol" element={<ResearchPage />} />
          <Route path="/settings" element={<SettingsPage current={apiKeys} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="muted small">
        Simulated money only. Market data may be delayed. Nothing here is financial advice.
      </footer>
    </>
  );
}

/** A fresh page per portfolio, so moving from one portfolio to another (e.g. to a new copy) never carries over unsaved edits. */
function PortfolioRoute() {
  const { id } = useParams();
  return <PortfolioPage key={id} />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}
