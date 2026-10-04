import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { mockProvider } from './providers/mock.js';
import { yahooProvider } from './providers/yahoo.js';
import type { History, MarketProvider, Quote } from './types.js';

initializeApp();
const db = getFirestore();

// Keep in sync with VITE_FUNCTIONS_REGION in the web app.
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const provider: MarketProvider = process.env.MARKET_PROVIDER === 'mock' ? mockProvider : yahooProvider;

const QUOTE_TTL_MS = 5 * 60 * 1000;
const HISTORY_TTL_MS = 12 * 60 * 60 * 1000;
const SYMBOL_RE = /^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$/;
const MAX_SYMBOLS = 50;

function requireUser(req: CallableRequest): void {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in to load market data.');
}

function cleanSymbol(raw: unknown): string {
  const symbol = String(raw ?? '').trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) throw new HttpsError('invalid-argument', `"${raw}" is not a valid symbol.`);
  return symbol;
}

/** Firestore document IDs cannot contain "/"; symbols never do, but "." and "^" are fine. */
const docId = (symbol: string) => symbol.replace(/\//g, '_');

function providerError(err: unknown, what: string): HttpsError {
  logger.error(`Market data provider failed: ${what}`, err);
  return new HttpsError('unavailable', `Could not load ${what} from the market data provider. Try again shortly.`);
}

export const searchSymbols = onCall(async (req) => {
  requireUser(req);
  const query = String(req.data?.query ?? '').trim();
  if (!query || query.length > 60) return { results: [] };
  try {
    return { results: await provider.search(query) };
  } catch (err) {
    throw providerError(err, `search results for "${query}"`);
  }
});

export const getQuotes = onCall(async (req) => {
  requireUser(req);
  const raw: unknown[] = Array.isArray(req.data?.symbols) ? req.data.symbols : [];
  const symbols = [...new Set(raw.map(cleanSymbol))];
  if (symbols.length > MAX_SYMBOLS) throw new HttpsError('invalid-argument', `At most ${MAX_SYMBOLS} symbols per request.`);
  if (!symbols.length) return { quotes: [] };

  const now = Date.now();
  const cached = new Map<string, Quote>();
  const refs = symbols.map((s) => db.collection('marketQuotes').doc(docId(s)));
  for (const snap of await db.getAll(...refs)) {
    const q = snap.data() as Quote | undefined;
    if (q && now - q.updatedAt < QUOTE_TTL_MS) cached.set(q.symbol, q);
  }

  const stale = symbols.filter((s) => !cached.has(s));
  if (stale.length) {
    let fresh: Quote[];
    try {
      fresh = await provider.quotes(stale);
    } catch (err) {
      throw providerError(err, `quotes for ${stale.join(', ')}`);
    }
    const batch = db.batch();
    for (const q of fresh) {
      cached.set(q.symbol, q);
      batch.set(db.collection('marketQuotes').doc(docId(q.symbol)), stripUndefined(q));
    }
    await batch.commit();
  }
  return { quotes: symbols.map((s) => cached.get(s)).filter(Boolean) };
});

export const getHistory = onCall({ memory: '512MiB' }, async (req) => {
  requireUser(req);
  const symbol = cleanSymbol(req.data?.symbol);
  const ref = db.collection('marketHistory').doc(docId(symbol));
  const snap = await ref.get();
  const cached = snap.data() as (History & { fetchedAt: number }) | undefined;
  if (cached && Date.now() - cached.fetchedAt < HISTORY_TTL_MS) {
    return { symbol, dates: cached.dates, closes: cached.closes };
  }

  let history: History;
  try {
    history = await provider.history(symbol);
  } catch (err) {
    if (cached) return { symbol, dates: cached.dates, closes: cached.closes };
    throw providerError(err, `price history for ${symbol}`);
  }
  if (!history.dates.length) throw new HttpsError('not-found', `No price history found for ${symbol}.`);
  // ~40 years of daily closes is roughly 200 KB, comfortably inside Firestore's 1 MiB document limit.
  await ref.set({ ...history, fetchedAt: Date.now() });
  return history;
});

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
