import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { applyTrades } from './sim/rebalance';
import type { Portfolio, Revision, Target, Trade, Transaction } from './types';

const portfoliosCol = (uid: string) => collection(db, 'users', uid, 'portfolios');
const portfolioDoc = (uid: string, pid: string) => doc(db, 'users', uid, 'portfolios', pid);
const transactionsCol = (uid: string, pid: string) => collection(portfolioDoc(uid, pid), 'transactions');
const revisionsCol = (uid: string, pid: string) => collection(portfolioDoc(uid, pid), 'revisions');

type Unsubscribe = () => void;

export function watchPortfolios(uid: string, cb: (p: Portfolio[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(portfoliosCol(uid), orderBy('createdAt', 'desc')),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Portfolio)),
    onError,
  );
}

export function watchPortfolio(uid: string, pid: string, cb: (p: Portfolio | null) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    portfolioDoc(uid, pid),
    (snap) => cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Portfolio) : null),
    onError,
  );
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
  input: { name: string; description?: string; startingCash: number; targets?: Target[] },
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

export async function duplicatePortfolio(uid: string, source: Portfolio): Promise<string> {
  return createPortfolio(uid, {
    name: `${source.name} (copy)`.slice(0, 80),
    description: source.description,
    startingCash: source.startingCash,
    targets: source.targets,
  });
}

export async function deletePortfolio(uid: string, pid: string) {
  for (const col of [transactionsCol(uid, pid), revisionsCol(uid, pid)]) {
    const snap = await getDocs(col);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(portfolioDoc(uid, pid));
}

