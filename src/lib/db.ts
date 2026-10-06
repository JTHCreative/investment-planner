import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { applyTrades } from './sim/rebalance';
import type { ApiKeys } from './market';
import type { Folder, Portfolio, PortfolioIconName, Revision, Role, Target, Trade, Transaction } from './types';

const portfoliosCol = (uid: string) => collection(db, 'users', uid, 'portfolios');
const portfolioDoc = (uid: string, pid: string) => doc(db, 'users', uid, 'portfolios', pid);
const transactionsCol = (uid: string, pid: string) => collection(portfolioDoc(uid, pid), 'transactions');
const revisionsCol = (uid: string, pid: string) => collection(portfolioDoc(uid, pid), 'revisions');

type Unsubscribe = () => void;

/** The owner comes from the document's path (users/{ownerId}/portfolios/{id}), so it can't be faked or go stale. */
const toPortfolio = (snap: DocumentSnapshot) => ({ id: snap.id, ownerId: snap.ref.parent.parent!.id, ...snap.data() }) as Portfolio;

/** The portfolios this person owns, newest first. */
export function watchPortfolios(uid: string, cb: (p: Portfolio[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(query(portfoliosCol(uid), orderBy('createdAt', 'desc')), (snap) => cb(snap.docs.map(toPortfolio)), onError);
}

/** Other people's portfolios shared with this person, newest first. */
export function watchSharedWithMe(uid: string, cb: (p: Portfolio[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collectionGroup(db, 'portfolios'), where('memberIds', 'array-contains', uid)),
    (snap) => cb(snap.docs.map(toPortfolio).sort((a, b) => b.createdAt - a.createdAt)),
    onError,
  );
}

export function watchPortfolio(uid: string, pid: string, cb: (p: Portfolio | null) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(portfolioDoc(uid, pid), (snap) => cb(snap.exists() ? toPortfolio(snap) : null), onError);
}

export function watchTransactions(uid: string, pid: string, cb: (t: Transaction[]) => void): Unsubscribe {
  return onSnapshot(query(transactionsCol(uid, pid), orderBy('at', 'desc')), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction)),
  );
}

export function watchRevisions(uid: string, pid: string, cb: (r: Revision[]) => void): Unsubscribe {
  return onSnapshot(query(revisionsCol(uid, pid), orderBy('createdAt', 'desc')), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Revision)),
  );
}

export async function createPortfolio(
  uid: string,
  input: { name: string; description?: string; startingCash: number; targets?: Target[]; icon?: PortfolioIconName },
): Promise<string> {
  const now = Date.now();
  const ref = doc(portfoliosCol(uid));
  const batch = writeBatch(db);
  batch.set(ref, {
    name: input.name,
    description: input.description ?? '',
    startingCash: input.startingCash,
    cash: input.startingCash,
    holdings: {},
    targets: input.targets ?? [],
    ...(input.icon ? { icon: input.icon } : {}),
    createdAt: now,
    updatedAt: now,
  });
  batch.set(doc(transactionsCol(uid, ref.id)), { type: 'deposit', amount: input.startingCash, at: now, note: 'Opening balance' });
  if (input.targets?.length) {
    batch.set(doc(revisionsCol(uid, ref.id)), { targets: input.targets, note: 'Initial plan', createdAt: now });
  }
  await batch.commit();
  return ref.id;
}

/** Change the icon shown next to a portfolio's name. Owners and editors can. */
export async function setPortfolioIcon(owner: string, pid: string, icon: PortfolioIconName) {
  await updateDoc(portfolioDoc(owner, pid), { icon, updatedAt: Date.now() });
}

export async function updatePortfolioInfo(uid: string, pid: string, info: { name: string; description: string }) {
  await updateDoc(portfolioDoc(uid, pid), { ...info, updatedAt: Date.now() });
}

/** Save a new target allocation and record it in the plan history. */
export async function saveTargets(uid: string, pid: string, targets: Target[], note?: string) {
  const now = Date.now();
  const clean = targets.map(({ symbol, weight, name, type }) => ({ symbol, weight, name: name ?? '', type: type ?? '' }));
  const batch = writeBatch(db);
  batch.update(portfolioDoc(uid, pid), { targets: clean, updatedAt: now });
  batch.set(doc(revisionsCol(uid, pid)), { targets: clean, note: note ?? '', createdAt: now });
  await batch.commit();
}

/** Atomically apply simulated trades: holdings, cash and the trade log all change together or not at all. */
export async function executeTrades(uid: string, pid: string, trades: Trade[], note?: string) {
  if (!trades.length) return;
  await runTransaction(db, async (tx) => {
    const ref = portfolioDoc(uid, pid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Portfolio not found.');
    const current = snap.data() as Portfolio;
    const next = applyTrades({ cash: current.cash, holdings: current.holdings ?? {} }, trades);
    const now = Date.now();
    tx.update(ref, { cash: next.cash, holdings: next.holdings, updatedAt: now });
    trades.forEach((t, i) => {
      tx.set(doc(transactionsCol(uid, pid)), {
        type: t.side,
        symbol: t.symbol,
        shares: t.shares,
        price: t.price,
        amount: t.amount,
        // Keep sells ordered before buys inside the same rebalance.
        at: now + i,
        note: note ?? '',
      });
    });
  });
}

export async function moveCash(uid: string, pid: string, amount: number) {
  if (!amount) return;
  await runTransaction(db, async (tx) => {
    const ref = portfolioDoc(uid, pid);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Portfolio not found.');
    const p = snap.data() as Portfolio;
    if (p.cash + amount < 0) throw new Error('Not enough cash to withdraw that much.');
    const now = Date.now();
    tx.update(ref, { cash: p.cash + amount, updatedAt: now });
    tx.set(doc(transactionsCol(uid, pid)), {
      type: amount > 0 ? 'deposit' : 'withdrawal',
      amount: Math.abs(amount),
      at: now,
    });
  });
}

export type DuplicateMode = 'plan' | 'exact';

/**
 * Copy a portfolio so it can be tweaked without touching the original.
 * - 'plan': same starting cash and target mix, nothing invested yet. Best for comparing variations of a plan.
 * - 'exact': also copies cash, holdings, trade log and plan history, so the copy starts exactly where the original is.
 */
export async function duplicatePortfolio(uid: string, source: Portfolio, name: string, mode: DuplicateMode): Promise<string> {
  const cleanName = name.trim().slice(0, 80) || `${source.name} (copy)`.slice(0, 80);
  const note = `Copied from ${source.name}`;
  if (mode === 'plan') {
    const id = await createPortfolio(uid, { name: cleanName, description: source.description, startingCash: source.startingCash, icon: source.icon });
    if (source.targets.length) await saveTargets(uid, id, source.targets, note);
    return id;
  }

  const now = Date.now();
  const ref = doc(portfoliosCol(uid));
  // The source may be someone else's portfolio shared with this person; the copy is always their own.
  const [txs, revs] = await Promise.all([getDocs(transactionsCol(source.ownerId, source.id)), getDocs(revisionsCol(source.ownerId, source.id))]);
  // Firestore batches hold up to 500 writes; split long histories across several.
  const writes: [ReturnType<typeof doc>, Record<string, unknown>][] = [
    [
      ref,
      {
        name: cleanName,
        description: source.description ?? '',
        startingCash: source.startingCash,
        cash: source.cash,
        holdings: source.holdings ?? {},
        targets: source.targets,
        ...(source.icon ? { icon: source.icon } : {}),
        createdAt: now,
        updatedAt: now,
      },
    ],
    ...txs.docs.map((d) => [doc(transactionsCol(uid, ref.id), d.id), d.data()] as [ReturnType<typeof doc>, Record<string, unknown>]),
    ...revs.docs.map((d) => [doc(revisionsCol(uid, ref.id), d.id), d.data()] as [ReturnType<typeof doc>, Record<string, unknown>]),
    [doc(revisionsCol(uid, ref.id)), { targets: source.targets, note, createdAt: now }],
  ];
  // The portfolio document goes in the first batch, so the copy never exists without its holdings.
  for (let i = 0; i < writes.length; i += 450) {
    const batch = writeBatch(db);
    for (const [r, data] of writes.slice(i, i + 450)) batch.set(r, data);
    await batch.commit();
  }
  return ref.id;
}

export async function deletePortfolio(uid: string, pid: string) {
  const ref = portfolioDoc(uid, pid);
  for (const col of [transactionsCol(uid, pid), revisionsCol(uid, pid), collection(ref, 'private'), collection(ref, 'joins')]) {
    const snap = await getDocs(col);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(portfolioDoc(uid, pid));
}


/** Per-user settings live on the user's own document: users/{uid}. */
export function watchApiKeys(uid: string, cb: (keys: Partial<ApiKeys>) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, 'users', uid), (snap) => cb((snap.data()?.apiKeys as Partial<ApiKeys>) ?? {}), onError);
}

export async function saveApiKeys(uid: string, keys: ApiKeys) {
  await setDoc(doc(db, 'users', uid), { apiKeys: { finnhub: keys.finnhub.trim(), alphaVantage: keys.alphaVantage.trim() } }, { merge: true });
}

/* ---------- Sharing ---------- */

const linkDoc = (owner: string, pid: string) => doc(portfolioDoc(owner, pid), 'private', 'link');
const joinDoc = (owner: string, pid: string, uid: string) => doc(portfolioDoc(owner, pid), 'joins', uid);

/** Give someone access, change what they can do, or (with `null`) take their access away. Owner only. */
export async function setMemberRole(owner: string, pid: string, member: string, role: Role | null) {
  const ref = portfolioDoc(owner, pid);
  if (role) await updateDoc(ref, new FieldPath('members', member), role, 'memberIds', arrayUnion(member));
  else await updateDoc(ref, new FieldPath('members', member), deleteField(), 'memberIds', arrayRemove(member));
}

/** Stop seeing a portfolio someone shared with you. */
export async function leavePortfolio(owner: string, pid: string, me: string) {
  await setMemberRole(owner, pid, me, null);
}

export interface ShareLink {
  /** Secret part of the link. A new token makes every earlier link stop working. */
  token: string;
  /** What someone opening the link gets, or 'off' when the link is turned off. */
  role: Role | 'off';
}

/** The owner's view of the share link. */
export function watchShareLink(owner: string, pid: string, cb: (link: ShareLink | null) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(linkDoc(owner, pid), (snap) => cb(snap.exists() ? (snap.data() as ShareLink) : null), onError);
}

export async function setShareLink(owner: string, pid: string, link: ShareLink) {
  await setDoc(linkDoc(owner, pid), link);
}

/** A long random token for share links: 128 bits, URL-safe. */
export function newLinkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Join a portfolio through a share link. The link says which role it grants, but the owner may have changed it since,
 * so if joining with that role is refused, the other one is tried. Returns false when the link doesn't work at all.
 */
export async function joinWithLink(owner: string, pid: string, token: string, hint: Role, me: string): Promise<boolean> {
  const ref = portfolioDoc(owner, pid);
  // Already have access (or it's your own)? Nothing to join.
  try {
    if ((await getDoc(ref)).exists()) return true;
  } catch {
    // Not readable yet: expected before joining.
  }
  for (const role of hint === 'edit' ? (['edit', 'view'] as const) : (['view', 'edit'] as const)) {
    const batch = writeBatch(db);
    batch.set(joinDoc(owner, pid, me), { token, at: Date.now() });
    batch.update(ref, new FieldPath('members', me), role, 'memberIds', arrayUnion(me));
    try {
      await batch.commit();
      return true;
    } catch {
      // Try the other role; the rules accept only the link's current one.
    }
  }
  return false;
}

/* ---------- Usernames ---------- */

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const normalizeUsername = (name: string) => name.trim().replace(/^@/, '').toLowerCase();

const profileCache = new Map<string, Promise<string | null>>();

/** Someone's username, or null if they haven't picked one. Cached for the session. */
export function getUsername(uid: string): Promise<string | null> {
  let hit = profileCache.get(uid);
  if (!hit) {
    hit = getDoc(doc(db, 'profiles', uid)).then(
      (snap) => (snap.data()?.username as string | undefined) ?? null,
      () => null,
    );
    profileCache.set(uid, hit);
  }
  return hit;
}

export function watchUsername(uid: string, cb: (name: string | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'profiles', uid),
    (snap) => cb((snap.data()?.username as string | undefined) ?? null),
    () => cb(null),
  );
}

/** The account holding a username, or null if nobody does. */
export async function findUsername(name: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'usernames', normalizeUsername(name)));
  return snap.exists() ? (snap.data().uid as string) : null;
}

/** Claim a username, releasing the old one in the same step. Fails if someone else already has it. */
export async function claimUsername(uid: string, name: string, previous: string | null) {
  const clean = normalizeUsername(name);
  if (!USERNAME_PATTERN.test(clean)) throw new Error('Use 3–20 lowercase letters, numbers or underscores.');
  if (clean === previous) return;
  if (await findUsername(clean)) throw new Error(`“${clean}” is taken. Try another.`);
  const batch = writeBatch(db);
  batch.set(doc(db, 'usernames', clean), { uid });
  batch.set(doc(db, 'profiles', uid), { username: clean });
  if (previous) batch.delete(doc(db, 'usernames', previous));
  await batch.commit();
  profileCache.set(uid, Promise.resolve(clean));
}

/* ---------- Folders ---------- */

/** Built-in folders every account has. They can be restyled or renamed, but not deleted. */
export const MY_FOLDER = 'mine';
export const SHARED_FOLDER = 'shared';

export interface FolderState {
  /** Custom folders, plus any styling of the built-in ones. */
  folders: Record<string, Omit<Folder, 'id'>>;
  /** Which folder each portfolio is filed in, by portfolio id. Portfolios not listed go to a built-in folder. */
  folderOf: Record<string, string>;
}

/** Folders live on the user's own document, so they come and go with the account and need no extra rules. */
export function watchFolders(uid: string, cb: (s: FolderState) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => cb({ folders: snap.data()?.folders ?? {}, folderOf: snap.data()?.folderOf ?? {} }),
    onError,
  );
}

export async function saveFolder(uid: string, folder: Folder) {
  const { id, ...rest } = folder;
  await setDoc(doc(db, 'users', uid), { folders: { [id]: rest } }, { merge: true });
}

/** Delete a folder. Its portfolios go back to the built-in folders. */
export async function deleteFolder(uid: string, id: string, folderOf: Record<string, string>) {
  const unfile = Object.fromEntries(Object.entries(folderOf).filter(([, f]) => f === id).map(([pid]) => [pid, deleteField()]));
  await setDoc(doc(db, 'users', uid), { folders: { [id]: deleteField() }, folderOf: unfile }, { merge: true });
}

export async function fileInFolder(uid: string, pid: string, folderId: string) {
  await setDoc(doc(db, 'users', uid), { folderOf: { [pid]: folderId } }, { merge: true });
}

export const newFolderId = () => doc(collection(db, 'users')).id;

