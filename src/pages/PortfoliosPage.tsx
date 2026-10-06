import { useState, type DragEvent, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../auth/AuthProvider';
import { ContextMenu, type MenuEntry } from '../components/ContextMenu';
import { DuplicateDialog } from '../components/DuplicateDialog';
import { FolderDialog } from '../components/FolderDialog';
import { FolderGlyph, folderColor } from '../components/FolderIcons';
import { BarsIcon, CopyIcon, FolderPlusIcon, GainBadge, MoreIcon, PencilIcon, PlusIcon, ShareIcon, SignOutIcon, UsersIcon } from '../components/Icons';
import { ShareDialog } from '../components/ShareDialog';
import { createPortfolio, fileInFolder, leavePortfolio, MY_FOLDER, SHARED_FOLDER } from '../lib/db';
import { moneyExact, pct, signedMoney } from '../lib/format';
import { useAccessiblePortfolios, useFolders, useQuotes, useUsername } from '../lib/hooks';
import { errorMessage } from '../lib/market';
import { portfolioPath } from '../lib/paths';
import { PRESETS } from '../lib/presets';
import { totalValue } from '../lib/sim/rebalance';
import type { Folder, Portfolio } from '../lib/types';

/** Drag data type for a portfolio card, so folders only react to portfolios being dragged (not text or files). */
const DRAG_TYPE = 'application/x-portfolio-id';

type Menu = { x: number; y: number } & ({ portfolio: Portfolio } | { folder: Folder });

export function PortfoliosPage() {
  const user = useUser();
  const me = user.uid;
  const navigate = useNavigate();
  const portfolios = useAccessiblePortfolios(me);
  const folders = useFolders(me);
  const symbols = portfolios.data.flatMap((p) => Object.keys(p.holdings ?? {}));
  const quotes = useQuotes(symbols);
  const prices = Object.fromEntries(Object.values(quotes.data).map((q) => [q.symbol, q.price]));
  const username = useUsername(me);

  const [params, setParams] = useSearchParams();
  const asked = params.get('folder');
  const selected = folders.folders.find((f) => f.id === asked) ?? folders.folders[0];
  const select = (id: string) => setParams(id === MY_FOLDER ? {} : { folder: id }, { replace: true });

  const [showCreate, setShowCreate] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ folder?: Folder; then?: (id: string) => void } | null>(null);
  const [sharing, setSharing] = useState<Portfolio | null>(null);
  const [duplicating, setDuplicating] = useState<Portfolio | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const inFolder = portfolios.data.filter((p) => folders.folderFor(p) === selected.id);
  const countIn = (id: string) => portfolios.data.filter((p) => folders.folderFor(p) === id).length;

  async function act(action: () => Promise<unknown>) {
    setActionError('');
    try {
      await action();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }
  const moveTo = (p: Portfolio, folderId: string) => act(() => fileInFolder(me, p.id, folderId));

  function openMenu(e: MouseEvent, target: { portfolio: Portfolio } | { folder: Folder }) {
    e.preventDefault();
    e.stopPropagation();
    // From a button (keyboard or click), open under it; from a right-click, open at the pointer.
    const fromButton = e.type === 'click';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: fromButton ? rect.left : e.clientX, y: fromButton ? rect.bottom + 4 : e.clientY, ...target });
  }

  function portfolioMenu(p: Portfolio): MenuEntry[] {
    const mine = p.ownerId === me;
    const current = folders.folderFor(p);
    return [
      { label: 'Open', onSelect: () => navigate(portfolioPath(p, me)) },
      mine
        ? { label: 'Share…', icon: <ShareIcon size={14} />, onSelect: () => setSharing(p) }
        : {
            label: 'Remove from my portfolios',
            icon: <SignOutIcon size={14} />,
            onSelect: () => {
              if (window.confirm(`Stop seeing “${p.name}”? Its owner can share it with you again.`)) void act(() => leavePortfolio(p.ownerId, p.id, me));
            },
          },
      { label: 'Duplicate…', icon: <CopyIcon size={14} />, onSelect: () => setDuplicating(p) },
      'separator',
      { heading: 'Move to folder' },
      ...folders.folders.map((f) => ({
        label: f.name,
        icon: <span style={{ color: folderColor(f.color) }}><FolderGlyph icon={f.icon} open={false} size={16} /></span>,
        checked: f.id === current,
        onSelect: () => void moveTo(p, f.id),
      })),
      { label: 'New folder…', icon: <FolderPlusIcon size={14} />, onSelect: () => setFolderDialog({ then: (id) => void moveTo(p, id) }) },
    ];
  }

  function folderMenu(f: Folder): MenuEntry[] {
    return [
      { label: 'Open', onSelect: () => select(f.id) },
      { label: 'Edit folder…', icon: <PencilIcon size={14} />, onSelect: () => setFolderDialog({ folder: f }) },
      'separator',
      { label: 'New folder…', icon: <FolderPlusIcon size={14} />, onSelect: () => setFolderDialog({ then: select }) },
    ];
  }

  // Dragging a portfolio onto a folder files it there.
  const dragProps = (f: Folder) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(f.id);
    },
    onDragLeave: () => setDropTarget((t) => (t === f.id ? null : t)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData(DRAG_TYPE);
      const p = portfolios.data.find((x) => x.id === id);
      setDropTarget(null);
      setDragging(null);
      if (p && folders.folderFor(p) !== f.id) void moveTo(p, f.id);
    },
  });

  const emptyText =
    selected.id === SHARED_FOLDER
      ? 'Nothing is shared yet. Portfolios other people share with you show up here, and so do the ones you share.'
      : selected.id === MY_FOLDER
        ? 'No portfolios here. Create one, or drag one onto this folder.'
        : 'This folder is empty. Drag a portfolio onto it, or right-click a portfolio and choose a folder.';

  return (
    <div className="stack-lg" style={{ gap: 32 }}>
      <section className="stack-lg">
        <div className="page-head">
          <div className="titles">
            <h1>Your portfolios</h1>
            <p className="subtitle">
              Each portfolio is a pretend account with pretend money. Try different mixes side by side to see which one fits you.
            </p>
          </div>
          <div className="actions">
            {portfolios.data.length > 1 && (
              <Link className="btn" to="/compare">
                <BarsIcon />
                Compare
              </Link>
            )}
            <button className="btn primary" onClick={() => setShowCreate(true)}>
              <PlusIcon />
              New portfolio
            </button>
          </div>
        </div>

        <nav className="folder-bar" aria-label="Folders">
          {folders.folders.map((f) => {
            const isSelected = f.id === selected.id;
            return (
              <button
                key={f.id}
                type="button"
                className={`folder-chip${isSelected ? ' selected' : ''}${dropTarget === f.id ? ' drop' : ''}`}
                aria-pressed={isSelected}
                style={{ '--folder-color': folderColor(f.color) } as React.CSSProperties}
                onClick={() => select(f.id)}
                onContextMenu={(e) => openMenu(e, { folder: f })}
                {...dragProps(f)}
              >
                <FolderGlyph icon={f.icon} open={isSelected || dropTarget === f.id} size={22} />
                <span className="folder-name">{f.name}</span>
                <span className="folder-count">{countIn(f.id)}</span>
              </button>
            );
          })}
          <button type="button" className="folder-chip add" onClick={() => setFolderDialog({ then: select })}>
            <FolderPlusIcon size={18} />
            <span className="folder-name">New folder</span>
          </button>
        </nav>

        {portfolios.error && <p className="error">{portfolios.error}</p>}
        {portfolios.sharedError && <p className="error small">Couldn’t load portfolios shared with you: {portfolios.sharedError}</p>}
        {folders.error && <p className="error small">Couldn’t load your folders: {folders.error}</p>}
        {actionError && <p className="error">{actionError}</p>}

        <section className="folder-window" aria-labelledby="folder-h">
          <div className="folder-window-head">
            <h2 id="folder-h" className="row" style={{ gap: 10 }}>
              <span style={{ color: 'var(--line)' }}>
                <FolderGlyph icon={selected.icon} open size={26} />
              </span>
              {selected.name}
              <span className="muted small">{inFolder.length}</span>
            </h2>
            <button type="button" className="btn sm ghost" onClick={() => setFolderDialog({ folder: selected })}>
              <PencilIcon size={14} />
              Edit folder
            </button>
          </div>

          {portfolios.loading ? (
            <p className="muted">Loading…</p>
          ) : inFolder.length === 0 ? (
            <div className="folder-empty">
              <p className="muted">{emptyText}</p>
              {selected.id === SHARED_FOLDER && username === null && (
                <p className="small">
                  <Link to="/settings">Pick a username</Link> so people can share portfolios with you by name.
                </p>
              )}
            </div>
          ) : (
            // Keyed by folder so opening another folder replays the cards' entrance.
            <div className="portfolio-grid" key={selected.id}>
              {inFolder.map((p, i) => (
                <PortfolioCard
                  key={p.id}
                  p={p}
                  me={me}
                  index={i}
                  prices={prices}
                  dragging={dragging === p.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, p.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragging(p.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                  onMenu={(e) => openMenu(e, { portfolio: p })}
                />
              ))}
            </div>
          )}
        </section>
      </section>

      {(showCreate || (!portfolios.loading && portfolios.data.length === 0)) && (
        <CreatePortfolio
          folders={folders.folders}
          initialFolder={selected.id === SHARED_FOLDER ? MY_FOLDER : selected.id}
          onNewFolder={(then) => setFolderDialog({ then })}
          onCancel={portfolios.data.length ? () => setShowCreate(false) : undefined}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={'portfolio' in menu ? `Actions for ${menu.portfolio.name}` : `Actions for ${menu.folder.name}`}
          entries={'portfolio' in menu ? portfolioMenu(menu.portfolio) : folderMenu(menu.folder)}
          onClose={() => setMenu(null)}
        />
      )}
      {folderDialog && (
        <FolderDialog
          uid={me}
          folder={folderDialog.folder}
          folderOf={folders.folderOf}
          onClose={() => setFolderDialog(null)}
          onSaved={folderDialog.then}
          onDeleted={() => select(MY_FOLDER)}
        />
      )}
      {sharing && <ShareDialog portfolio={sharing} onClose={() => setSharing(null)} />}
      {duplicating && <DuplicateDialog portfolio={duplicating} onClose={() => setDuplicating(null)} />}
    </div>
  );
}

function PortfolioCard({
  p,
  me,
  index,
  prices,
  dragging,
  onDragStart,
  onDragEnd,
  onMenu,
}: {
  p: Portfolio;
  me: string;
  index: number;
  prices: Record<string, number>;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onMenu: (e: MouseEvent) => void;
}) {
  const pending = Object.keys(p.holdings ?? {}).some((s) => !(s in prices));
  const value = totalValue(p, prices);
  const gain = value - p.startingCash;
  const planned = p.targets.reduce((a, t) => a + t.weight, 0);
  return (
    <div
      className={`portfolio-card${dragging ? ' dragging' : ''}`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={onMenu}
    >
      <div className="stack" style={{ gap: 4 }}>
        {/* The title link stretches over the whole card; the menu button sits above it. */}
        <Link to={portfolioPath(p, me)} className="name stretched-link" style={{ color: 'var(--text)', textDecoration: 'none' }} draggable={false}>
          {p.name}
        </Link>
        {p.description && <span className="muted small truncate">{p.description}</span>}
        <ShareTag p={p} me={me} />
      </div>
      <div className="stack" style={{ gap: 8, alignItems: 'flex-start' }}>
        <span className="value">{pending ? '…' : moneyExact(value)}</span>
        {!pending && (
          <GainBadge value={gain}>
            {signedMoney(gain)} ({pct(gain / p.startingCash, 2, true)})
          </GainBadge>
        )}
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {p.targets.length > 0 && (
          <div className="mix-bar" aria-hidden>
            {p.targets.map((t, i) => (
              <span key={t.symbol} style={{ flex: `${t.weight} 1 0`, background: `var(--series-${(i % 6) + 1})` }} />
            ))}
            {planned < 0.999 && <span style={{ flex: `${1 - planned} 1 0`, background: 'var(--cash)' }} />}
          </div>
        )}
        <span className="xsmall muted">
          {p.targets.length ? p.targets.map((t) => `${t.symbol} ${pct(t.weight, 0)}`).join(' · ') : 'No plan yet'}
        </span>
      </div>
      <button type="button" className="icon-btn card-action" aria-label={`More actions for ${p.name}`} aria-haspopup="menu" onClick={onMenu}>
        <MoreIcon size={18} />
      </button>
    </div>
  );
}

/** "Shared by @alice · View only" on someone else's portfolio, "Shared with 2 people" on your own shared one. */
function ShareTag({ p, me }: { p: Portfolio; me: string }) {
  const owner = useUsername(p.ownerId === me ? undefined : p.ownerId);
  const count = p.memberIds?.length ?? 0;
  if (p.ownerId === me && count === 0) return null;
  return (
    <span className="share-tag">
      <UsersIcon size={12} />
      {p.ownerId === me
        ? `Shared with ${count} ${count === 1 ? 'person' : 'people'}`
        : `Shared by ${owner ? `@${owner}` : 'someone'} · ${p.members?.[me] === 'edit' ? 'Can edit' : 'View only'}`}
    </span>
  );
}

function CreatePortfolio({
  folders,
  initialFolder,
  onNewFolder,
  onCancel,
}: {
  folders: Folder[];
  initialFolder: string;
  onNewFolder: (then: (id: string) => void) => void;
  onCancel?: () => void;
}) {
  const user = useUser();
  const navigate = useNavigate();
  const [name, setName] = useState('My $100k plan');
  const [cash, setCash] = useState(100_000);
  const [preset, setPreset] = useState('');
  const [folder, setFolder] = useState(initialFolder);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const chosen = PRESETS.find((p) => p.name === preset);
      const id = await createPortfolio(user.uid, {
        name: name.trim(),
        startingCash: cash,
        description: chosen ? `Started from the ${chosen.name} mix` : '',
        targets: chosen?.targets,
      });
      // New portfolios aren't shared, so My Portfolios is already their home; anything else is filed explicitly.
      if (folder !== MY_FOLDER) await fileInFolder(user.uid, id, folder);
      navigate(`/p/${id}?tab=plan`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="new-h">
      <div className="card-head">
        <h2 id="new-h">New portfolio</h2>
        <p className="muted small">Start empty, or pick a ready-made mix and tweak it later.</p>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          Name
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Starting cash
          <span className="affix has-pre">
            <span className="pre">$</span>
            <input type="number" min={1} step="any" required value={cash} onChange={(e) => setCash(Number(e.target.value))} />
          </span>
        </label>
        <label className="field">
          Start from
          <select value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="">Empty (all cash)</option>
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>{p.name} — {p.description}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Folder
          <select
            value={folder}
            onChange={(e) => (e.target.value === '__new' ? onNewFolder(setFolder) : setFolder(e.target.value))}
          >
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
            <option value="__new">New folder…</option>
          </select>
        </label>
        {error && <p className="error" style={{ gridColumn: '1 / -1' }}>{error}</p>}
        <div className="actions" style={{ gridColumn: '1 / -1' }}>
          <button className="btn primary" disabled={busy || !(cash > 0)}>Create portfolio</button>
          {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
        </div>
      </form>
    </section>
  );
}
