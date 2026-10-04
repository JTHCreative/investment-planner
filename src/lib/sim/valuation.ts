import type { PriceSeries, Transaction } from '../types';
import { closeOnOrBefore } from './series';

export interface ValuePoint {
  date: string;
  value: number;
  cash: number;
}

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Rebuild a portfolio's daily value from its transaction log and price history.
 * Used to chart how a simulated account has actually done since it was opened.
 *
 * Prices are adjusted closes, so a holding's value is scaled by (adjusted close today / adjusted close on the trade day)
 * rather than shares × adjusted close. That keeps dividends in the growth without mis-pricing the original purchase.
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

  // Each lot remembers its value at trade time and the adjusted close it was bought at.
  const lots = new Map<string, { dollarsAtRef: number; refClose: number }>();
  let cash = startingCash;
  let txIndex = 0;
  const points: ValuePoint[] = [];

  for (const day of calendar) {
    while (txIndex < txs.length && isoDate(txs[txIndex].at) <= day) {
      const tx = txs[txIndex++];
      if (tx.type === 'deposit') cash += tx.amount;
      else if (tx.type === 'withdrawal') cash -= tx.amount;
      else if (tx.symbol && series[tx.symbol]) {
        const ref = closeOnOrBefore(series[tx.symbol], day) ?? tx.price ?? 1;
        const lot = lots.get(tx.symbol);
        const current = lot ? (lot.dollarsAtRef * ref) / lot.refClose : 0;
        const next = tx.type === 'buy' ? current + tx.amount : Math.max(0, current - tx.amount);
        lots.set(tx.symbol, { dollarsAtRef: next, refClose: ref });
        cash += tx.type === 'buy' ? -tx.amount : tx.amount;
      }
    }
    let value = cash;
    for (const [symbol, lot] of lots) {
      const close = closeOnOrBefore(series[symbol], day) ?? lot.refClose;
      value += (lot.dollarsAtRef * close) / lot.refClose;
    }
    points.push({ date: day, value, cash });
  }
  return points;
}
