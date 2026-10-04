import type { History, MarketProvider, Quote, SearchResult } from '../types.js';

/**
 * Made-up but realistic-looking market data for offline development and tests.
 * Enable with MARKET_PROVIDER=mock. Never use it to make real decisions.
 */
interface MockAsset {
  name: string;
  type: string;
  /** Rough annual return and volatility used to generate prices. */
  drift: number;
  vol: number;
  start: string;
  price: number;
  yield?: number;
}

const ASSETS: Record<string, MockAsset> = {
  VTI: { name: 'Vanguard Total Stock Market ETF', type: 'ETF', drift: 0.1, vol: 0.16, start: '2001-06-15', price: 290, yield: 0.013 },
  VOO: { name: 'Vanguard S&P 500 ETF', type: 'ETF', drift: 0.1, vol: 0.15, start: '2010-09-09', price: 540, yield: 0.013 },
  SPY: { name: 'SPDR S&P 500 ETF Trust', type: 'ETF', drift: 0.1, vol: 0.15, start: '1993-01-29', price: 590, yield: 0.012 },
  QQQ: { name: 'Invesco QQQ Trust', type: 'ETF', drift: 0.13, vol: 0.22, start: '1999-03-10', price: 510, yield: 0.006 },
  VXUS: { name: 'Vanguard Total International Stock ETF', type: 'ETF', drift: 0.06, vol: 0.17, start: '2011-01-28', price: 66, yield: 0.03 },
  SCHD: { name: 'Schwab U.S. Dividend Equity ETF', type: 'ETF', drift: 0.09, vol: 0.14, start: '2011-10-20', price: 28, yield: 0.035 },
  VNQ: { name: 'Vanguard Real Estate ETF', type: 'ETF', drift: 0.07, vol: 0.2, start: '2004-09-29', price: 92, yield: 0.038 },
  BND: { name: 'Vanguard Total Bond Market ETF', type: 'ETF', drift: 0.03, vol: 0.05, start: '2007-04-10', price: 73, yield: 0.037 },
  AGG: { name: 'iShares Core U.S. Aggregate Bond ETF', type: 'ETF', drift: 0.03, vol: 0.05, start: '2003-09-29', price: 99, yield: 0.037 },
  TLT: { name: 'iShares 20+ Year Treasury Bond ETF', type: 'ETF', drift: 0.035, vol: 0.14, start: '2002-07-30', price: 90, yield: 0.042 },
  TIP: { name: 'iShares TIPS Bond ETF', type: 'ETF', drift: 0.03, vol: 0.06, start: '2003-12-05', price: 110, yield: 0.03 },
  SGOV: { name: 'iShares 0-3 Month Treasury Bond ETF', type: 'ETF', drift: 0.02, vol: 0.004, start: '2020-06-05', price: 100.5, yield: 0.045 },
  GLD: { name: 'SPDR Gold Shares', type: 'ETF', drift: 0.07, vol: 0.15, start: '2004-11-18', price: 330, yield: 0 },
  AAPL: { name: 'Apple Inc.', type: 'EQUITY', drift: 0.2, vol: 0.32, start: '1985-01-02', price: 230, yield: 0.004 },
  MSFT: { name: 'Microsoft Corporation', type: 'EQUITY', drift: 0.17, vol: 0.27, start: '1986-03-13', price: 430, yield: 0.007 },
  NVDA: { name: 'NVIDIA Corporation', type: 'EQUITY', drift: 0.3, vol: 0.5, start: '1999-01-22', price: 175, yield: 0.0003 },
  'BTC-USD': { name: 'Bitcoin USD', type: 'CRYPTOCURRENCY', drift: 0.4, vol: 0.7, start: '2014-09-17', price: 95000 },
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
}

function assetFor(symbol: string): MockAsset {
  return ASSETS[symbol] ?? { name: `${symbol} (mock)`, type: 'EQUITY', drift: 0.08, vol: 0.25, start: '2005-01-03', price: 50 + (hash(symbol) % 200) };
}

/** Business days from `start` to today, with a shared "market" shock so assets are correlated. */
function generate(symbol: string): History {
  const a = assetFor(symbol);
  const market = rng(12345);
  const own = rng(hash(symbol));
  const dt = 1 / 252;
  const beta = a.type === 'ETF' && a.drift <= 0.035 ? -0.1 : a.vol > 0.01 ? 0.8 : 0;
  const dates: string[] = [];
  const logs: number[] = [];
  let logPrice = 0;
  const end = new Date();
  for (let d = new Date('1985-01-01T00:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const m = gaussian(market);
    const iso = d.toISOString().slice(0, 10);
    if (iso < a.start) continue;
    const z = beta * m + Math.sqrt(1 - beta * beta) * gaussian(own);
    logPrice += (a.drift - (a.vol * a.vol) / 2) * dt + a.vol * Math.sqrt(dt) * z;
    dates.push(iso);
    logs.push(logPrice);
  }
  // Scale so the latest close equals the asset's "current" price.
  const last = logs[logs.length - 1] ?? 0;
  const closes = logs.map((l) => Math.round(a.price * Math.exp(l - last) * 10000) / 10000);
  return { symbol, dates, closes };
}

export const mockProvider: MarketProvider = {
  async search(query) {
    const q = query.trim().toUpperCase();
    return Object.entries(ASSETS)
      .filter(([symbol, a]) => symbol.includes(q) || a.name.toUpperCase().includes(q))
      .slice(0, 12)
      .map(([symbol, a]): SearchResult => ({ symbol, name: a.name, type: a.type, exchange: 'MOCK' }));
  },

  async quotes(symbols) {
    return symbols.map((symbol): Quote => {
      const a = assetFor(symbol);
      const h = generate(symbol);
      const n = h.closes.length;
      const price = h.closes[n - 1];
      const previousClose = h.closes[n - 2] ?? price;
      const lastYear = h.closes.slice(-252);
      return {
        symbol,
        name: a.name,
        type: a.type,
        currency: 'USD',
        exchange: 'MOCK',
        price,
        previousClose,
        change: price - previousClose,
        changePercent: ((price - previousClose) / previousClose) * 100,
        fiftyTwoWeekHigh: Math.max(...lastYear),
        fiftyTwoWeekLow: Math.min(...lastYear),
        dividendYield: a.yield,
        updatedAt: Date.now(),
      };
    });
  },

  async history(symbol) {
    return generate(symbol);
  },
};
