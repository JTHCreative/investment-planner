import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AlphaVantageError, alphaVantageMonthly } from './providers/alphaVantage';
import { finnhubDetails, finnhubQuote, finnhubSearch, type Details } from './providers/finnhub';
import { mockProvider } from './providers/mock';
import type { PriceSeries, Quote, SearchResult } from './types';

/**
 * Market data, fetched straight from the browser (no server needed, so Firebase stays on the free Spark plan):
 * - Finnhub: live quotes, search, stats.
 * - Alpha Vantage: monthly dividend-adjusted price history, cached in Firestore and shared by all users.
 */

export interface ApiKeys {
  finnhub: string;
  alphaVantage: string;
}

const env = import.meta.env;
export const useMockData = env.VITE_MARKET_PROVIDER === 'mock';

// Keys baked in at build time (e.g. from GitHub repository secrets); a user's own keys in Settings take priority.
const buildKeys: ApiKeys = {
  finnhub: env.VITE_FINNHUB_API_KEY || '',
  alphaVantage: env.VITE_ALPHA_VANTAGE_API_KEY || '',
};
let userKeys: Partial<ApiKeys> = {};

function keys(): ApiKeys {
  return {
    finnhub: userKeys.finnhub || buildKeys.finnhub,
    alphaVantage: userKeys.alphaVantage || buildKeys.alphaVantage,
  };
}

// Lets hooks re-fetch after keys change.
let version = 0;
const listeners = new Set<() => void>();
export const subscribeMarket = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const marketVersion = () => version;

export function setUserApiKeys(next: Partial<ApiKeys>) {
  if (next.finnhub === userKeys.finnhub && next.alphaVantage === userKeys.alphaVantage) return;
  userKeys = { ...next };
  quoteCache.clear();
  historyCache.clear();
  recentFailures.clear();
  avPausedUntil = 0;
  version++;
  listeners.forEach((fn) => fn());
}

/** Which keys are still needed before market data works. */
export function missingKeys(): (keyof ApiKeys)[] {
  if (useMockData) return [];
  const k = keys();
  return (['finnhub', 'alphaVantage'] as const).filter((name) => !k[name]);
}

function requireKey(name: keyof ApiKeys): string {
  const key = keys()[name];
  if (!key) {
    const label = name === 'finnhub' ? 'Finnhub' : 'Alpha Vantage';
    throw new Error(`Add your free ${label} API key in Settings to load market data.`);
  }
  return key;
}

// Names learned from search and profiles, so quotes can show "Vanguard Total Stock Market ETF" instead of just "VTI".
const names = new Map<string, { name: string; type: string }>();

export async function searchSymbols(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const results = useMockData ? await mockProvider.search(query) : await finnhubSearch(query, requireKey('finnhub'));
  for (const r of results) names.set(r.symbol, { name: r.name, type: r.type });
  return results;
}

const quoteCache = new Map<string, { quote: Quote; at: number }>();
const QUOTE_TTL_MS = 60 * 1000;

export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const now = Date.now();
  const missing = wanted.filter((s) => !(now - (quoteCache.get(s)?.at ?? 0) < QUOTE_TTL_MS));

  if (missing.length) {
    if (useMockData) {
      for (const q of await mockProvider.quotes(missing)) quoteCache.set(q.symbol, { quote: q, at: now });
    } else {
      const key = requireKey('finnhub');
      const fetched = await Promise.all(missing.map((s) => finnhubQuote(s, key)));
      fetched.forEach((q, i) => {
        if (!q) return;
        const known = names.get(missing[i]);
        quoteCache.set(q.symbol, { quote: { ...q, name: known?.name ?? q.symbol, type: known?.type ?? '' }, at: now });
      });
    }
  }

  const out: Record<string, Quote> = {};
  for (const s of wanted) {
    const hit = quoteCache.get(s);
    if (hit) out[s] = hit.quote;
  }
  return out;
}

/** Name and key stats for the research page (costs two Finnhub calls). */
export async function getDetails(symbol: string): Promise<Details> {
  if (useMockData) return {};
  const d = await finnhubDetails(symbol, requireKey('finnhub'));
  if (d.name && !names.has(symbol)) names.set(symbol, { name: d.name, type: '' });
  return d;
}

/** Monthly history changes slowly; refreshing every couple of days keeps well inside 25 downloads a day. */
const HISTORY_TTL_MS = 2 * 24 * 60 * 60 * 1000;
/** Free Alpha Vantage keys allow about one request a second; leave a little margin. */
const AV_SPACING_MS = 1500;
/** Don't ask again for a symbol that just failed; every request, failed or not, counts against the daily 25. */
const FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
/** After the daily limit is hit, stop calling Alpha Vantage for a while instead of spending nothing but errors. */
const DAILY_LIMIT_PAUSE_MS = 60 * 60 * 1000;

const historyCache = new Map<string, Promise<PriceSeries>>();
const recentFailures = new Map<string, { error: Error; at: number }>();
let avPausedUntil = 0;
let avQueue: Promise<unknown> = Promise.resolve();
let avLastCall = 0;

/** Problems with the shared Firestore cache. Without a working cache every visit re-downloads history. */
let cacheProblem = '';
export const historyCacheProblem = () => cacheProblem;

function reportCacheProblem(err: unknown) {
  const code = (err as { code?: string })?.code;
  const message =
    code === 'permission-denied'
      ? 'The shared price-history cache is blocked by Firestore security rules, so every visit re-downloads history and uses up Alpha Vantage’s 25 free downloads quickly. Publish the latest firestore.rules in the Firebase console.'
      : `The shared price-history cache isn’t working (${errorMessage(err)}), so history is re-downloaded on every visit.`;
  console.warn('marketHistory cache:', err);
  if (message !== cacheProblem) {
    cacheProblem = message;
    listeners.forEach((fn) => fn());
  }
}

interface CachedHistory extends PriceSeries {
  fetchedAt: number;
}

/** One Alpha Vantage request at a time, spaced out, retrying once or twice if it says we're going too fast. */
function fetchMonthlyQueued(symbol: string): Promise<PriceSeries> {
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      if (Date.now() < avPausedUntil) {
        throw new AlphaVantageError('daily-limit', 'Alpha Vantage’s free limit (25 history downloads a day) is used up. Already-downloaded symbols still work; new ones will load after the limit resets.');
      }
      const wait = avLastCall + AV_SPACING_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      avLastCall = Date.now();
      try {
        return await alphaVantageMonthly(symbol, requireKey('alphaVantage'));
      } catch (err) {
        if (err instanceof AlphaVantageError && err.kind === 'too-fast' && attempt < 2) {
          avLastCall = Date.now() + 2000;
          continue;
        }
        if (err instanceof AlphaVantageError && err.kind === 'daily-limit') avPausedUntil = Date.now() + DAILY_LIMIT_PAUSE_MS;
        throw err;
      }
    }
  };
  const next = avQueue.then(run, run);
  avQueue = next.catch(() => {});
  return next;
}

async function loadHistory(symbol: string): Promise<PriceSeries> {
  if (useMockData) return mockProvider.history(symbol);

  const ref = doc(db, 'marketHistory', symbol.replace(/\//g, '_'));
  let cached: CachedHistory | undefined;
  try {
    cached = (await getDoc(ref)).data() as CachedHistory | undefined;
  } catch (err) {
    reportCacheProblem(err);
  }
  if (cached && Date.now() - cached.fetchedAt < HISTORY_TTL_MS) {
    return { symbol, dates: cached.dates, closes: cached.closes };
  }

  const failed = recentFailures.get(symbol);
  if (failed && Date.now() - failed.at < FAILURE_COOLDOWN_MS) {
    if (cached) return { symbol, dates: cached.dates, closes: cached.closes };
    throw failed.error;
  }

  try {
    const fresh = await fetchMonthlyQueued(symbol);
    if (!fresh.dates.length) throw new Error(`No price history found for ${symbol}.`);
    recentFailures.delete(symbol);
    // Share with every user so the next person doesn't spend a download on it.
    setDoc(ref, { ...fresh, fetchedAt: Date.now() }).catch(reportCacheProblem);
    return fresh;
  } catch (err) {
    recentFailures.set(symbol, { error: err instanceof Error ? err : new Error(String(err)), at: Date.now() });
    // An old copy beats nothing, e.g. when today's free downloads are used up.
    if (cached) return { symbol, dates: cached.dates, closes: cached.closes };
    throw err;
  }
}

export function getHistory(symbol: string): Promise<PriceSeries> {
  const key = symbol.toUpperCase();
  let p = historyCache.get(key);
  if (!p) {
    p = loadHistory(key);
    p.catch(() => historyCache.delete(key));
    historyCache.set(key, p);
  }
  return p;
}

export async function getHistories(symbols: string[]): Promise<PriceSeries[]> {
  return Promise.all(symbols.map(getHistory));
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}
