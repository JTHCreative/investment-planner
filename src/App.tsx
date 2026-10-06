import { signOut } from 'firebase/auth';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { BarsIcon, BriefcaseIcon, InfoIcon, LogoIcon, SearchIcon, SettingsIcon, SignOutIcon } from './components/Icons';
import { auth } from './firebase';
import { ComparePage } from './pages/ComparePage';
import { JoinPage } from './pages/JoinPage';
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

  const onPortfolios = location.pathname === '/' || /^\/(p|s|join)\//.test(location.pathname);
  const navClass = (active: boolean) => (active ? 'active' : undefined);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark"><LogoIcon size={18} /></span>
            <span className="brand-name">Investment Planner</span>
          </Link>
          <nav className="nav" aria-label="Main">
            <Link to="/" className={navClass(onPortfolios)} aria-current={onPortfolios ? 'page' : undefined}><BriefcaseIcon />Portfolios</Link>
            <NavLink to="/compare" className={({ isActive }) => navClass(isActive)}><BarsIcon />Compare</NavLink>
            <NavLink to="/research" className={({ isActive }) => navClass(isActive)}><SearchIcon />Research</NavLink>
            <NavLink to="/settings" className={({ isActive }) => navClass(isActive)}><SettingsIcon />Settings</NavLink>
          </nav>
          <div className="user">
            <span className="user-email">{email}</span>
            <button className="nav-link signout" onClick={() => signOut(auth)}>
              <SignOutIcon />
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        {missing.length > 0 && location.pathname !== '/settings' && (
          <div className="notice">
            <InfoIcon size={20} />
            <p>Live prices need free API keys from {missing.map((k) => (k === 'finnhub' ? 'Finnhub' : 'Alpha Vantage')).join(' and ')}.</p>
            <Link to="/settings" className="btn sm">Add them in Settings</Link>
          </div>
        )}
        {cacheProblem && (
          <div className="notice warn">
            <InfoIcon size={20} />
            <p>{cacheProblem}</p>
          </div>
        )}
        <Routes>
          <Route path="/" element={<PortfoliosPage />} />
          <Route path="/p/:id" element={<PortfolioRoute />} />
          <Route path="/s/:owner/:id" element={<PortfolioRoute />} />
          <Route path="/join/:owner/:id/:token" element={<JoinPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/research/:symbol" element={<ResearchPage />} />
          <Route path="/settings" element={<SettingsPage current={apiKeys} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">Simulated money only. Market data may be delayed. Nothing here is financial advice.</footer>
    </div>
  );
}

/** A fresh page per portfolio, so moving from one portfolio to another (e.g. to a new copy) never carries over unsaved edits. */
function PortfolioRoute() {
  const { id, owner } = useParams();
  return <PortfolioPage key={`${owner ?? ''}/${id}`} />;
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
