import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  arrayUnion,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// Run with `npm run test:rules`, which starts the Firestore emulator around these tests.
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-investment-planner',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const portfolio = (db: ReturnType<typeof as>, owner = 'olivia', pid = 'p1') => doc(db, 'users', owner, 'portfolios', pid);

const base = { name: 'Plan', cash: 1000, startingCash: 1000, holdings: {}, targets: [], createdAt: 1, updatedAt: 1 };

/** Olivia owns p1. Victor can view it, Eddie can edit it, Stranger has no access. */
async function seed(extra: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', 'olivia', 'portfolios', 'p1'), {
      ...base,
      members: { victor: 'view', eddie: 'edit' },
      memberIds: ['victor', 'eddie'],
      ...extra,
    });
    await setDoc(doc(db, 'users', 'olivia', 'portfolios', 'p1', 'transactions', 't1'), { type: 'deposit', amount: 1000, at: 1 });
    await setDoc(doc(db, 'users', 'olivia', 'portfolios', 'p1', 'private', 'link'), { token: 'secret-token', role: 'view' });
  });
}

/** What the app does when someone opens a share link. */
function join(uid: string, token: string, role: string) {
  const db = as(uid);
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', 'olivia', 'portfolios', 'p1', 'joins', uid), { token, at: Date.now() });
  batch.update(portfolio(db), new FieldPath('members', uid), role, 'memberIds', arrayUnion(uid));
  return batch.commit();
}

describe('portfolio access', () => {
  it('lets the owner and members read, and nobody else', async () => {
    await seed();
    await assertSucceeds(getDoc(portfolio(as('olivia'))));
    await assertSucceeds(getDoc(portfolio(as('victor'))));
    await assertSucceeds(getDoc(portfolio(as('eddie'))));
    await assertFails(getDoc(portfolio(as('stranger'))));
    await assertSucceeds(getDocs(query(collectionGroup(as('victor'), 'portfolios'), where('memberIds', 'array-contains', 'victor'))));
    await assertFails(getDocs(query(collectionGroup(as('stranger'), 'portfolios'), where('memberIds', 'array-contains', 'victor'))));
  });

  it('lets editors trade but not viewers', async () => {
    await seed();
    await assertSucceeds(updateDoc(portfolio(as('eddie')), { cash: 500, holdings: { VTI: { shares: 1, costBasis: 500 } } }));
    await assertFails(updateDoc(portfolio(as('victor')), { cash: 1 }));
    await assertSucceeds(setDoc(doc(as('eddie'), 'users', 'olivia', 'portfolios', 'p1', 'transactions', 't2'), { type: 'buy', at: 2 }));
    await assertFails(setDoc(doc(as('victor'), 'users', 'olivia', 'portfolios', 'p1', 'transactions', 't3'), { type: 'buy', at: 3 }));
    await assertSucceeds(getDoc(doc(as('victor'), 'users', 'olivia', 'portfolios', 'p1', 'transactions', 't1')));
    await assertFails(getDoc(doc(as('stranger'), 'users', 'olivia', 'portfolios', 'p1', 'transactions', 't1')));
  });

  it('keeps sharing decisions with the owner', async () => {
    await seed();
    // An editor can't add people or promote a viewer.
    await assertFails(updateDoc(portfolio(as('eddie')), new FieldPath('members', 'stranger'), 'view', 'memberIds', arrayUnion('stranger')));
    await assertFails(updateDoc(portfolio(as('eddie')), new FieldPath('members', 'victor'), 'edit'));
    await assertFails(updateDoc(portfolio(as('victor')), new FieldPath('members', 'victor'), 'edit'));
    await assertFails(getDoc(doc(as('eddie'), 'users', 'olivia', 'portfolios', 'p1', 'private', 'link')));
    await assertFails(getDoc(doc(as('victor'), 'users', 'olivia', 'portfolios', 'p1', 'private', 'link')));
    // Only the owner deletes.
    await assertFails(deleteDoc(portfolio(as('eddie'))));
    await assertSucceeds(updateDoc(portfolio(as('olivia')), new FieldPath('members', 'stranger'), 'view', 'memberIds', arrayUnion('stranger')));
  });

  it('keeps members and memberIds in step', async () => {
    await seed();
    await assertFails(updateDoc(portfolio(as('olivia')), new FieldPath('members', 'stranger'), 'view'));
  });

  it('lets a member leave, but only by removing themselves', async () => {
    await seed();
    // Removing someone else is the owner's call.
    await assertFails(updateDoc(portfolio(as('eddie')), new FieldPath('members', 'victor'), deleteField(), 'memberIds', ['eddie']));
    await assertSucceeds(
      updateDoc(portfolio(as('victor')), new FieldPath('members', 'victor'), deleteField(), 'memberIds', ['eddie']),
    );
    await assertFails(getDoc(portfolio(as('victor'))));
  });
});

describe('share links', () => {
  it('lets someone with the token join with the link’s role', async () => {
    await seed();
    await assertSucceeds(join('newbie', 'secret-token', 'view'));
    await assertSucceeds(getDoc(portfolio(as('newbie'))));
  });

  it('refuses a wrong token, a different role, or a turned-off link', async () => {
    await seed();
    await assertFails(join('newbie', 'guessed-token', 'view'));
    await assertFails(join('newbie', 'secret-token', 'edit'));
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'users', 'olivia', 'portfolios', 'p1', 'private', 'link'), { token: 'secret-token', role: 'off' }),
    );
    await assertFails(join('newbie', 'secret-token', 'view'));
  });

  it('can’t be used by an existing viewer to become an editor', async () => {
    await seed();
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'users', 'olivia', 'portfolios', 'p1', 'private', 'link'), { token: 'secret-token', role: 'edit' }),
    );
    await assertFails(join('victor', 'secret-token', 'edit'));
  });

  it('only lets people write their own join record', async () => {
    await seed();
    await assertFails(setDoc(doc(as('stranger'), 'users', 'olivia', 'portfolios', 'p1', 'joins', 'newbie'), { token: 'x', at: 1 }));
  });
});

describe('usernames', () => {
  function claim(uid: string, name: string, previous?: string) {
    const db = as(uid);
    const batch = writeBatch(db);
    batch.set(doc(db, 'usernames', name), { uid });
    batch.set(doc(db, 'profiles', uid), { username: name });
    if (previous) batch.delete(doc(db, 'usernames', previous));
    return batch.commit();
  }

  it('claims, renames, and protects names', async () => {
    await assertSucceeds(claim('olivia', 'olivia'));
    await assertFails(claim('stranger', 'olivia'));
    await assertFails(claim('stranger', 'Bad Name'));
    await assertSucceeds(claim('olivia', 'liv', 'olivia'));
    await assertSucceeds(claim('stranger', 'olivia'));
    await assertSucceeds(getDoc(doc(as('victor'), 'profiles', 'olivia')));
  });

  it('allows only one name per account', async () => {
    await assertSucceeds(claim('olivia', 'olivia'));
    // A second name without releasing the first would leave the profile pointing at only one of them.
    await assertFails(setDoc(doc(as('olivia'), 'usernames', 'spare'), { uid: 'olivia' }));
    await assertFails(setDoc(doc(as('stranger'), 'profiles', 'stranger'), { username: 'olivia' }));
  });
});
