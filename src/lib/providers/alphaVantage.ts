import type { PriceSeries } from '../types';

/**
 * Alpha Vantage (https://www.alphavantage.co): free key, 25 calls/day, allows calls straight from the browser.
 * Its free monthly *adjusted* series includes dividends and splits and goes back 20+ years, which is what the
 * backtests and projections need. The app caches each series in Firestore, so a symbol costs one call every few days.
 */
export async function alphaVantageMonthly(symbol: string, key: string): Promise<PriceSeries> {
  const url = `https://www.alphavantage.co/query?${new URLSearchParams({
    function: 'TIME_SERIES_MONTHLY_ADJUSTED',
    symbol,
    apikey: key,
  })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage request failed (${res.status}).`);
  const body = (await res.json()) as Record<string, unknown>;

  if (typeof body['Error Message'] === 'string') throw new Error(`Alpha Vantage has no price history for ${symbol}.`);
  const notice = body.Note ?? body.Information;
  if (typeof notice === 'string') {
    throw new Error(
      /api ?key/i.test(notice) && !/limit|frequency/i.test(notice)
        ? 'Alpha Vantage rejected the API key. Check it in Settings.'
        : 'Alpha Vantage’s free limit (25 history downloads a day) is used up. Already-downloaded symbols still work; new ones will load tomorrow.',
    );
  }

  const rows = body['Monthly Adjusted Time Series'] as Record<string, Record<string, string>> | undefined;
  if (!rows) throw new Error(`Unexpected response from Alpha Vantage for ${symbol}.`);
  const dates = Object.keys(rows).sort();
  const out: PriceSeries = { symbol, dates: [], closes: [] };
  for (const d of dates) {
    const close = parseFloat(rows[d]['5. adjusted close']);
    if (close > 0) {
      out.dates.push(d);
      out.closes.push(Math.round(close * 10000) / 10000);
    }
  }
  return out;
}
