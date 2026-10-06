import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useUser } from '../auth/AuthProvider';
import { findUsername, newLinkToken, normalizeUsername, setMemberRole, setShareLink, watchShareLink, type ShareLink } from '../lib/db';
import { usePortfolio, useUsername } from '../lib/hooks';
import { errorMessage } from '../lib/market';
import type { Portfolio, Role } from '../lib/types';
import { CheckIcon, CloseIcon, CopyIcon, LinkIcon, UserPlusIcon } from './Icons';

/** The address someone opens to join. The role is a hint so the app knows what to ask for; the rules decide. */
export function shareUrl(owner: string, pid: string, link: ShareLink) {
  return `${window.location.origin}${import.meta.env.BASE_URL}join/${owner}/${pid}/${link.token}?r=${link.role}`;
}

/**
 * The owner's sharing controls: give people access by username, set each person to view or edit, and turn on a link
 * that gives anyone who opens it a chosen level of access.
 */
export function ShareDialog({ portfolio: initial, onClose }: { portfolio: Portfolio; onClose: () => void }) {
  const user = useUser();
  const ref = useRef<HTMLDialogElement>(null);
  // Follow the portfolio live, so the people list updates as access changes.
  const live = usePortfolio(initial.ownerId, initial.id);
  const p = live.data ?? initial;
  const members = Object.entries(p.members ?? {});

  const [who, setWho] = useState('');
  const [role, setRole] = useState<Role>('view');
  const [link, setLink] = useState<ShareLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  useEffect(() => watchShareLink(p.ownerId, p.id, setLink, (e) => setError(e.message)), [p.ownerId, p.id]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function addPerson(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const name = normalizeUsername(who);
      const uid = await findUsername(name);
      if (!uid) throw new Error(`Nobody has the username “${name}”. Check the spelling with them.`);
      if (uid === user.uid) throw new Error('That’s you. You already own this portfolio.');
      await setMemberRole(p.ownerId, p.id, uid, role);
      setWho('');
    });
  }

  const linkRole = link?.role ?? 'off';
  function setLinkRole(next: Role | 'off') {
    void run(() => setShareLink(p.ownerId, p.id, { token: link?.token ?? newLinkToken(), role: next }));
  }
  const url = link && link.role !== 'off' ? shareUrl(p.ownerId, p.id, link) : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Couldn’t copy. Select the link and copy it yourself.');
    }
  }

  return (
    <dialog ref={ref} className="dialog share-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="stack-lg" style={{ gap: 22 }}>
        <div className="row spread">
          <h2>Share “{p.name}”</h2>
          <button type="button" className="icon-btn sm" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <form className="share-add" onSubmit={addPerson}>
          <label className="field" style={{ flex: '1 1 180px' }}>
            Add someone by username
            <span className="affix has-pre">
              <span className="pre">@</span>
              <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="username" autoCapitalize="none" autoComplete="off" spellCheck={false} />
            </span>
          </label>
          <label className="field">
            Access
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
          </label>
          <button className="btn primary" disabled={busy || !who.trim()}>
            <UserPlusIcon size={16} />
            Add
          </button>
        </form>

        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">People with access</span>
          <ul className="people-list">
            <li>
              <PersonName uid={p.ownerId} you={p.ownerId === user.uid} />
              <span className="muted small">Owner</span>
            </li>
            {members.map(([uid, r]) => (
              <li key={uid}>
                <PersonName uid={uid} you={uid === user.uid} />
                <select
                  className="compact-select"
                  aria-label="Access"
                  value={r}
                  disabled={busy}
                  onChange={(e) => void run(() => setMemberRole(p.ownerId, p.id, uid, e.target.value as Role))}
                >
                  <option value="view">Can view</option>
                  <option value="edit">Can edit</option>
                </select>
                <button
                  type="button"
                  className="icon-btn sm"
                  aria-label="Remove access"
                  disabled={busy}
                  onClick={() => void run(() => setMemberRole(p.ownerId, p.id, uid, null))}
                >
                  <CloseIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <div className="row spread" style={{ gap: 12 }}>
            <span className="row" style={{ gap: 8 }}>
              <LinkIcon size={16} />
              Anyone with the link
            </span>
            <select className="compact-select" aria-label="Link access" value={linkRole} disabled={busy} onChange={(e) => setLinkRole(e.target.value as Role | 'off')}>
              <option value="off">Off</option>
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
          </div>
          {url && (
            <>
              <div className="share-link">
                <input readOnly value={url} aria-label="Share link" onFocus={(e) => e.target.select()} />
                <button type="button" className="btn sm" onClick={copy}>
                  {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="xsmall muted">
                People who open it sign in and are added to the list above, where you can change or remove their access.{' '}
                <button type="button" className="btn-link xsmall" disabled={busy} onClick={() => void run(() => setShareLink(p.ownerId, p.id, { token: newLinkToken(), role: linkRole as Role }))}>
                  Make a new link
                </button>{' '}
                to stop the old one working.
              </p>
            </>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        <p className="xsmall muted">
          Viewers can look at everything. Editors can also trade, move cash, rename it and change the plan. Only you can share or delete it.
        </p>
      </div>
    </dialog>
  );
}

function PersonName({ uid, you }: { uid: string; you: boolean }) {
  const name = useUsername(uid);
  return (
    <span className="person">
      <span className="avatar" aria-hidden>{(name ?? '?').slice(0, 1).toUpperCase()}</span>
      <span>
        {name ? `@${name}` : name === null ? 'No username yet' : '…'}
        {you && <span className="muted"> (you)</span>}
      </span>
    </span>
  );
}
