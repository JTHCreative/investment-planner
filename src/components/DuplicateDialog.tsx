import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../auth/AuthProvider';
import { duplicatePortfolio, type DuplicateMode } from '../lib/db';
import { money } from '../lib/format';
import { errorMessage } from '../lib/market';
import type { Portfolio } from '../lib/types';
import { CopyIcon } from './Icons';

/** A "Duplicate" button that opens a small dialog, makes the copy, and opens the copy's plan editor. */
export function DuplicateButton({ portfolio, className }: { portfolio: Portfolio; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? 'btn'} onClick={() => setOpen(true)}>
        <CopyIcon />
        Duplicate
      </button>
      {open && <DuplicateDialog portfolio={portfolio} onClose={() => setOpen(false)} />}
    </>
  );
}

export function DuplicateDialog({ portfolio: p, onClose }: { portfolio: Portfolio; onClose: () => void }) {
  const user = useUser();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const invested = Object.keys(p.holdings ?? {}).length > 0;
  const [name, setName] = useState(`${p.name} (copy)`.slice(0, 80));
  const [mode, setMode] = useState<DuplicateMode>('plan');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Open as a modal once mounted. No close() on cleanup: that fires the dialog's close event, which would
  // read as the user dismissing it (and React's dev-mode remount would shut it immediately).
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const id = await duplicatePortfolio(user.uid, p, name, mode);
      onClose();
      navigate(`/p/${id}?tab=plan`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    // Escape and clicks on the backdrop close it, like any dialog.
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <form className="stack-lg" style={{ gap: 20 }} onSubmit={submit}>
        <h2>Duplicate “{p.name}”</h2>
        <label className="field">
          Name for the copy
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
        </label>

        <fieldset className="choices">
          <legend>What to copy</legend>
          <label className="choice">
            <input type="radio" name="mode" checked={mode === 'plan'} onChange={() => setMode('plan')} />
            <span>
              <span style={{ fontSize: 16 }}>Just the plan</span>
              <span className="muted small">
                Same mix of investments and {money(p.startingCash)} of fresh cash, nothing bought yet. Best for trying a variation and comparing.
              </span>
            </span>
          </label>
          <label className={`choice ${invested ? '' : 'disabled'}`}>
            <input type="radio" name="mode" checked={mode === 'exact'} disabled={!invested} onChange={() => setMode('exact')} />
            <span>
              <span style={{ fontSize: 16 }}>Exact copy</span>
              <span className="muted small">
                {invested
                  ? 'Also copies what’s invested, the cash, and the trade and plan history, so the copy starts exactly where this one is today.'
                  : 'Nothing is invested in this portfolio yet, so this would be the same as copying the plan.'}
              </span>
            </span>
          </label>
        </fieldset>

        <p className="xsmall muted">The original stays exactly as it is. You’ll go straight to the copy’s plan so you can make your changes.</p>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy || !name.trim()}>
            {busy ? 'Copying…' : 'Duplicate'}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
