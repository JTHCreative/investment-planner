import type { PriceSeries, Transaction } from '../types';

export interface ValuePoint {
  date: string;
  value: number;
  cash: number;
}

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Rebuild a portfolio's value over time from its transaction log and price history.
 * Used to chart how a simulated account has actually done since it was opened.
 *
 * Prices are adjusted closes, so a holding's value is scaled by (adjusted close now / reference price at the trade)
 * rather than shares × adjusted close. That keeps dividends in the growth without mis-pricing the original purchase.
 * Works with daily or monthly history; append today's live price as the last point to bring it up to date.
 */
export function valueHistory(
  transactions: Transaction[],
  series: Record<string, PriceSeries>,
  startingCash: number,
  today: string = isoDate(Date.now()),
): ValuePoint[] {
  const txs = [...transactions].sort((a, b) => a.at - b.at);
  if (!txs.length) return [];

  // Trading days from the first transaction to today, taken from the union of all series.
  const firstDay = isoDate(txs[0].at);
  const days = new Set<string>();
  for (const s of Object.values(series)) for (const d of s.dates) if (d >= firstDay && d <= today) days.add(d);
  const calendar = [...days].sort();
  if (!calendar.length || calendar[0] > firstDay) calendar.unshift(firstDay);

  // Each lot remembers its value at a reference point: the trade, or the last history point used to revalue it.
  const lots = new Map<string, { dollars: number; refClose: number; refDay: string }>();
  let cash = startingCash;
  let txIndex = 0;
  const points: ValuePoint[] = [];

  /** The lot's value on `day`. Only moves once the history has a point after the lot's reference day. */
  function lotValue(symbol: string, lot: { dollars: number; refClose: number; refDay: string }, day: string): number {
    const s = series[symbol];
    const i = lastIndexOnOrBefore(s, day);
    if (i < 0 || s.dates[i] <= lot.refDay) return lot.dollars;
    return (lot.dollars * s.closes[i]) / lot.refClose;
  }

  for (const day of calendar) {
    while (txIndex < txs.length && isoDate(txs[txIndex].at) <= day) {
      const tx = txs[txIndex++];
      if (tx.type === 'deposit') cash += tx.amount;
      else if (tx.type === 'withdrawal') cash -= tx.amount;
      else if (tx.symbol && series[tx.symbol]) {
        const s = series[tx.symbol];
        const tradeDay = isoDate(tx.at);
        const lot = lots.get(tx.symbol);
        const current = lot ? lotValue(tx.symbol, lot, tradeDay) : 0;
        const next = tx.type === 'buy' ? current + tx.amount : Math.max(0, current - tx.amount);
        // Reference price: the history's close on the trade day when it has one (daily data). With monthly data
        // the trade usually falls between points, so the actual fill price is the better reference.
        const i = lastIndexOnOrBefore(s, tradeDay);
        const ref = i >= 0 && s.dates[i] === tradeDay ? s.closes[i] : tx.price ?? s.closes[Math.max(0, i)];
        lots.set(tx.symbol, { dollars: next, refClose: ref, refDay: tradeDay });
        cash += tx.type === 'buy' ? -tx.amount : tx.amount;
      }
    }
    let value = cash;
    for (const [symbol, lot] of lots) value += lotValue(symbol, lot, day);
    points.push({ date: day, value, cash });
  }
  return points;
}

function lastIndexOnOrBefore(s: PriceSeries, date: string): number {
  let lo = 0;
  let hi = s.dates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.dates[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
