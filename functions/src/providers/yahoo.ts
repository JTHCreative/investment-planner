import YahooFinance from 'yahoo-finance2';
import type { History, MarketProvider, Quote, SearchResult } from '../types.js';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const SEARCHABLE_TYPES = new Set(['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX', 'CRYPTOCURRENCY', 'MONEYMARKET']);

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * Yahoo Finance via the community `yahoo-finance2` library. Free and keyless, covering
 * US/international stocks, ETFs (including bond ETFs), mutual funds, indexes and crypto.
 * It is unofficial: fine for a personal planner, not for a commercial product.
 */
export const yahooProvider: MarketProvider = {
  async search(query) {
    const res = (await yf.search(query, { quotesCount: 12, newsCount: 0 }, { validateResult: false })) as {
      quotes?: Record<string, unknown>[];
    };
    const out: SearchResult[] = [];
    for (const q of res.quotes ?? []) {
      const type = String(q.quoteType ?? '');
      if (typeof q.symbol !== 'string' || !SEARCHABLE_TYPES.has(type)) continue;
      out.push({
        symbol: q.symbol,
        name: String(q.longname ?? q.shortname ?? q.symbol),
        type,
        exchange: typeof q.exchDisp === 'string' ? q.exchDisp : undefined,
      });
    }
    return out;
  },

  async quotes(symbols) {
    const rows = (await yf.quote(symbols, { return: 'array' }, { validateResult: false })) as Record<string, unknown>[];
    const now = Date.now();
    return rows
      .filter((q) => typeof q.symbol === 'string' && num(q.regularMarketPrice) !== undefined)
      .map((q): Quote => {
        const trailingYield = num(q.trailingAnnualDividendYield);
        const pctYield = num(q.dividendYield);
        return {
          symbol: q.symbol as string,
          name: String(q.longName ?? q.shortName ?? q.symbol),
          type: String(q.quoteType ?? 'OTHER'),
          currency: String(q.currency ?? 'USD'),
          exchange: typeof q.fullExchangeName === 'string' ? q.fullExchangeName : undefined,
          price: q.regularMarketPrice as number,
          previousClose: num(q.regularMarketPreviousClose),
          change: num(q.regularMarketChange),
          changePercent: num(q.regularMarketChangePercent),
          fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh),
          fiftyTwoWeekLow: num(q.fiftyTwoWeekLow),
          dividendYield: trailingYield || (pctYield !== undefined ? pctYield / 100 : undefined),
          marketCap: num(q.marketCap),
          trailingPE: num(q.trailingPE),
          updatedAt: now,
        };
      });
  },

  async history(symbol) {
    const res = (await yf.chart(
      symbol,
      { period1: '1985-01-01', interval: '1d', return: 'array' },
      { validateResult: false },
    )) as { quotes?: { date: Date | string; close: number | null; adjclose?: number | null }[] };
    const out: History = { symbol, dates: [], closes: [] };
    for (const row of res.quotes ?? []) {
      const close = row.adjclose ?? row.close;
      if (close == null || !(close > 0)) continue;
      out.dates.push(new Date(row.date).toISOString().slice(0, 10));
      out.closes.push(Math.round(close * 10000) / 10000);
    }
    return out;
  },
};
