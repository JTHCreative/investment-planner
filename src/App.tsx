import { signOut } from 'firebase/auth';
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { auth } from './firebase';
import { ComparePage } from './pages/ComparePage';
import { LoginPage } from './pages/LoginPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { PortfoliosPage } from './pages/PortfoliosPage';
import { ResearchPage } from './pages/ResearchPage';

function Shell() {
  const { user, loading } = useAuth();
  if (loading) return <div className="login muted">Loading…</div>;
  if (!user) return <LoginPage />;

  return (
    <>
      <header className="topbar">
        <NavLink to="/" className="brand">Investment Planner</NavLink>
        <nav>
          <NavLink to="/" end>Portfolios</NavLink>
          <NavLink to="/compare">Compare</NavLink>
          <NavLink to="/research">Research</NavLink>
        </nav>
        <button className="link small" onClick={() => signOut(auth)} title={user.email ?? ''}>Sign out</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<PortfoliosPage />} />
          <Route path="/p/:id" element={<PortfolioPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/research" element={<ResearchPage />} />
          <Route path="/research/:symbol" element={<ResearchPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="muted small">
        Simulated money only. Market data may be delayed. Nothing here is financial advice.
      </footer>
    </>
  );
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
