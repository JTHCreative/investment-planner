import type { Quote, SearchResult } from '../types';

/**
 * Finnhub (https://finnhub.io): free key, 60 calls/minute, allows calls straight from the browser.
 * Free tier covers US stock/ETF quotes, symbol search and basic stats. Price history is paid, so it comes from Alpha Vantage.
 */
const BASE = 'https://finnhub.io/api/v1';

async function call<T>(path: string, params: Record<string, string>, key: string): Promise<T> {
  const url = `${BASE}${path}?${new URLSearchParams({ ...params, token: key })}`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error('Finnhub rate limit reached (60 per minute). Wait a moment and try again.');
  if (res.status === 401 || res.status === 403) throw new Error('Finnhub rejected the API key, or this data needs a paid plan. Check the key in Settings.');
  if (!res.ok) throw new Error(`Finnhub request failed (${res.status}).`);
  return res.json() as Promise<T>;
}

const TYPE_MAP: Record<string, string> = {
  'Common Stock': 'EQUITY',
  ADR: 'EQUITY',
  REIT: 'EQUITY',
  ETP: 'ETF',
  'Closed-End Fund': 'MUTUALFUND',
  'Open-End Fund': 'MUTUALFUND',
};

export async function finnhubSearch(query: string, key: string): Promise<SearchResult[]> {
  const res = await call<{ result?: { symbol: string; displaySymbol: string; description: string; type: string }[] }>(
    '/search',
    { q: query, exchange: 'US' },
    key,
  );
  return (res.result ?? [])
    // Free quotes cover US listings only; skip foreign-exchange suffixes like ".TO" or ".MX" (keep class shares like BRK.B).
    .filter((r) => !/\.[A-Z]{2,}$/.test(r.symbol) && !r.symbol.includes(':'))
    .slice(0, 12)
    .map((r) => ({ symbol: r.symbol, name: titleCase(r.description), type: TYPE_MAP[r.type] ?? (r.type || 'OTHER') }));
}

export async function finnhubQuote(symbol: string, key: string): Promise<Omit<Quote, 'name' | 'type'> | null> {
  const q = await call<{ c: number; d: number | null; dp: number | null; pc: number; t: number }>('/quote', { symbol }, key);
  // Unknown symbols come back as all zeros.
  if (!q.c && !q.t) return null;
  return {
    symbol,
    currency: 'USD',
    price: q.c,
    previousClose: q.pc || undefined,
    change: q.d ?? undefined,
    changePercent: q.dp ?? undefined,
    updatedAt: q.t ? q.t * 1000 : Date.now(),
  };
}

export interface Details {
  name?: string;
  exchange?: string;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  dividendYield?: number;
  marketCap?: number;
  trailingPE?: number;
}

/** Company name and key stats. ETFs often have little here on the free tier, so every field is optional. */
export async function finnhubDetails(symbol: string, key: string): Promise<Details> {
  const [profile, metrics] = await Promise.all([
    call<{ name?: string; exchange?: string }>('/stock/profile2', { symbol }, key).catch(() => ({}) as { name?: string; exchange?: string }),
    call<{ metric?: Record<string, number | undefined> }>('/stock/metric', { symbol, metric: 'all' }, key).catch(() => ({ metric: {} })),
  ]);
  const m: Record<string, number | undefined> = metrics.metric ?? {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const yieldPct = num(m.dividendYieldIndicatedAnnual) ?? num(m.currentDividendYieldTTM);
  const capMillions = num(m.marketCapitalization);
  return {
    name: profile.name || undefined,
    exchange: profile.exchange || undefined,
    fiftyTwoWeekHigh: num(m['52WeekHigh']),
    fiftyTwoWeekLow: num(m['52WeekLow']),
    dividendYield: yieldPct !== undefined ? yieldPct / 100 : undefined,
    marketCap: capMillions !== undefined ? capMillions * 1e6 : undefined,
    trailingPE: num(m.peTTM) ?? num(m.peBasicExclExtraTTM),
  };
}

/** Finnhub names are ALL CAPS. Soften long words but keep short ones (tickers, "ETF", "S&P") as they are. */
function titleCase(s: string): string {
  const small = new Set(['INC', 'CO', 'OF', 'THE', 'AND', 'LTD', 'FUND', 'CORP', 'TR']);
  return s
    .split(' ')
    .map((w) => (w.length > 3 || small.has(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(' ');
}
