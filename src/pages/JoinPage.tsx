import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useUser } from '../auth/AuthProvider';
import { joinWithLink } from '../lib/db';
import { portfolioPath } from '../lib/paths';
import type { Role } from '../lib/types';

/** Opened from a share link: adds the signed-in person to the portfolio, then opens it. */
export function JoinPage() {
  const { owner = '', id = '', token = '' } = useParams();
  const [params] = useSearchParams();
  const user = useUser();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const hint: Role = params.get('r') === 'edit' ? 'edit' : 'view';

  useEffect(() => {
    let live = true;
    joinWithLink(owner, id, token, hint, user.uid).then((ok) => {
      if (!live) return;
      if (ok) navigate(portfolioPath({ id, ownerId: owner }, user.uid), { replace: true });
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [owner, id, token, hint, user.uid, navigate]);

  if (!failed) return <p className="muted">Opening the shared portfolio…</p>;
  return (
    <div className="stack">
      <h1>This link doesn’t work</h1>
      <p className="muted">
        It may have been turned off or replaced with a new one. Ask the person who sent it for a fresh link, or to share the portfolio with
        your username.
      </p>
      <p>
        <Link to="/">Back to portfolios</Link>
      </p>
    </div>
  );
}
