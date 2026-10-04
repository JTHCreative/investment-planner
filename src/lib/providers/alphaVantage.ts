import type { PriceSeries } from '../types';

export type AlphaVantageErrorKind = 'daily-limit' | 'too-fast' | 'premium' | 'bad-key' | 'no-data' | 'other';

export class AlphaVantageError extends Error {
  constructor(
    readonly kind: AlphaVantageErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Alpha Vantage answers problems with HTTP 200 and a text notice. Some notices mention several limits at once
 * (the "too fast" one also says "25 requests per day"), so check the most specific wording first.
 */
export function classifyNotice(notice: string): AlphaVantageErrorKind {
  if (/per second|sparingly|frequency|per minute/i.test(notice)) return 'too-fast';
  if (/premium endpoint/i.test(notice)) return 'premium';
  if (/apikey is invalid|invalid api ?key|api ?key.*(invalid|missing)/i.test(notice)) return 'bad-key';
  if (/per day|daily/i.test(notice)) return 'daily-limit';
  return 'other';
}

const MESSAGES: Record<AlphaVantageErrorKind, string> = {
  'daily-limit':
    'Alpha Vantage’s free limit (25 history downloads a day) is used up. Already-downloaded symbols still work; new ones will load after the limit resets.',
  'too-fast': 'Alpha Vantage asked us to slow down (free keys allow about one request a second). Try again in a moment.',
  premium: 'Alpha Vantage now requires a paid plan for this data.',
  'bad-key': 'Alpha Vantage rejected the API key. Check it in Settings.',
  'no-data': 'Alpha Vantage has no price history for this symbol.',
  other: 'Alpha Vantage returned an unexpected response.',
};

/**
 * Alpha Vantage (https://www.alphavantage.co): free key, 25 calls/day and about 1 call/second, callable from the browser.
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
  if (!res.ok) throw new AlphaVantageError('other', `Alpha Vantage request failed (${res.status}).`);
  const body = (await res.json()) as Record<string, unknown>;

  if (typeof body['Error Message'] === 'string') {
    throw new AlphaVantageError('no-data', `Alpha Vantage has no price history for ${symbol}.`);
  }
  const notice = body.Note ?? body.Information;
  if (typeof notice === 'string') {
    const kind = classifyNotice(notice);
    // Keep the provider's own words in the console; they're the best clue if the wording changes again.
    console.warn(`Alpha Vantage notice for ${symbol}:`, notice);
    throw new AlphaVantageError(kind, MESSAGES[kind]);
  }

  const rows = body['Monthly Adjusted Time Series'] as Record<string, Record<string, string>> | undefined;
  if (!rows) throw new AlphaVantageError('other', `${MESSAGES.other} (${symbol})`);
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
