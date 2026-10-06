import { useEffect, useRef, useState, type FormEvent } from 'react';
import { deleteFolder, MY_FOLDER, newFolderId, saveFolder, SHARED_FOLDER } from '../lib/db';
import { errorMessage } from '../lib/market';
import type { Folder, FolderColor } from '../lib/types';
import { FOLDER_COLORS, FolderGlyph, folderColor } from './FolderIcons';

/**
 * Create a folder, or edit its name and color. Custom folders can also be deleted here; the two built-in
 * folders can be restyled but always stay.
 */
export function FolderDialog({
  uid,
  folder,
  folderOf,
  onClose,
  onSaved,
  onDeleted,
}: {
  uid: string;
  /** The folder to edit; leave out to create a new one. */
  folder?: Folder;
  folderOf: Record<string, string>;
  onClose: () => void;
  onSaved?: (id: string) => void;
  onDeleted?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(folder?.name ?? '');
  const [color, setColor] = useState<FolderColor>(folder?.color ?? 'purple');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const builtIn = folder?.id === MY_FOLDER || folder?.id === SHARED_FOLDER;

  // Same pattern as the duplicate dialog: open as a modal once mounted, and let its close event report dismissal.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const id = folder?.id ?? newFolderId();
    void run(async () => {
      await saveFolder(uid, { id, name: name.trim().slice(0, 40), color, createdAt: folder?.createdAt ?? Date.now() });
      onClose();
      onSaved?.(id);
    });
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <form className="stack-lg" style={{ gap: 20 }} onSubmit={submit}>
        <div className="row" style={{ gap: 14 }}>
          <span className="folder-preview" style={{ color: folderColor(color) }}>
            <FolderGlyph open={false} size={40} />
          </span>
          <h2>{folder ? 'Edit folder' : 'New folder'}</h2>
        </div>
        <label className="field">
          Name
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Retirement" />
        </label>

        <fieldset className="swatch-picker">
          <legend>Color</legend>
          {FOLDER_COLORS.map(([key, label, css]) => (
            <label key={key} className="swatch-option" title={label}>
              <input type="radio" name="color" checked={color === key} onChange={() => setColor(key)} aria-label={label} />
              <span style={{ background: css }} />
            </label>
          ))}
        </fieldset>

        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy || !name.trim()}>{folder ? 'Save' : 'Create folder'}</button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          {folder && !builtIn && (
            <button
              type="button"
              className={`btn ${confirmDelete ? 'danger' : 'ghost'}`}
              style={{ marginLeft: 'auto' }}
              disabled={busy}
              onClick={() =>
                confirmDelete
                  ? void run(async () => {
                      await deleteFolder(uid, folder.id, folderOf);
                      onClose();
                      onDeleted?.();
                    })
                  : setConfirmDelete(true)
              }
            >
              {confirmDelete ? 'Delete folder' : 'Delete…'}
            </button>
          )}
        </div>
        {confirmDelete && (
          <p className="xsmall muted">The portfolios in it aren’t deleted. They go back to My Portfolios or Shared Portfolios.</p>
        )}
      </form>
    </dialog>
  );
}
