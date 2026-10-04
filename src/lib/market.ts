import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { PriceSeries, Quote, SearchResult } from './types';

const searchFn = httpsCallable<{ query: string }, { results: SearchResult[] }>(functions, 'searchSymbols');
const quotesFn = httpsCallable<{ symbols: string[] }, { quotes: Quote[] }>(functions, 'getQuotes');
const historyFn = httpsCallable<{ symbol: string }, PriceSeries>(functions, 'getHistory');

// The server caches too; this just avoids repeat round-trips within a session.
const historyCache = new Map<string, Promise<PriceSeries>>();
const quoteCache = new Map<string, { quote: Quote; at: number }>();
const QUOTE_TTL_MS = 60 * 1000;

export async function searchSymbols(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  return (await searchFn({ query })).data.results;
}

export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const now = Date.now();
  const missing = wanted.filter((s) => !(now - (quoteCache.get(s)?.at ?? 0) < QUOTE_TTL_MS));
  if (missing.length) {
    const { quotes } = (await quotesFn({ symbols: missing })).data;
    for (const q of quotes) quoteCache.set(q.symbol, { quote: q, at: now });
  }
  const out: Record<string, Quote> = {};
  for (const s of wanted) {
    const hit = quoteCache.get(s);
    if (hit) out[s] = hit.quote;
  }
  return out;
}

export function getHistory(symbol: string): Promise<PriceSeries> {
  const key = symbol.toUpperCase();
  let p = historyCache.get(key);
  if (!p) {
    p = historyFn({ symbol: key }).then((r) => r.data);
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
