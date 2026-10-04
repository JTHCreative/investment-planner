import type { Holdings, Target, Trade } from '../types';

export interface PortfolioState {
  cash: number;
  holdings: Holdings;
}

export function holdingsValue(holdings: Holdings, prices: Record<string, number>): number {
  let total = 0;
  for (const [symbol, h] of Object.entries(holdings)) total += h.shares * (prices[symbol] ?? 0);
  return total;
}

export function totalValue(state: PortfolioState, prices: Record<string, number>): number {
  return state.cash + holdingsValue(state.holdings, prices);
}

/** Validates targets: non-negative, no duplicates, and summing to at most 100%. Returns an error message or null. */
export function validateTargets(targets: Target[]): string | null {
  const seen = new Set<string>();
  let sum = 0;
  for (const t of targets) {
    if (!t.symbol) return 'Every allocation needs a symbol.';
    if (seen.has(t.symbol)) return `${t.symbol} is listed more than once.`;
    seen.add(t.symbol);
    if (!(t.weight >= 0)) return `${t.symbol} has an invalid weight.`;
    sum += t.weight;
  }
  if (sum > 1 + 1e-9) return `Allocations add up to ${(sum * 100).toFixed(1)}%, which is over 100%.`;
  return null;
}

/**
 * Trades that move a portfolio to its target weights at the given prices.
 * Fractional shares are allowed. Anything not allocated stays in cash.
 * Sells come first so their proceeds fund the buys. Trades smaller than `minTradeAmount` are skipped.
 */
export function planRebalance(
  state: PortfolioState,
  targets: Target[],
  prices: Record<string, number>,
  minTradeAmount = 1,
): Trade[] {
  const total = totalValue(state, prices);
  const targetWeight = new Map(targets.map((t) => [t.symbol, t.weight]));
  const symbols = new Set([...Object.keys(state.holdings), ...targetWeight.keys()]);

  const sells: Trade[] = [];
  const buys: Trade[] = [];
  for (const symbol of symbols) {
    const price = prices[symbol];
    if (!(price > 0)) throw new Error(`No price available for ${symbol}.`);
    const currentShares = state.holdings[symbol]?.shares ?? 0;
    const desiredShares = (total * (targetWeight.get(symbol) ?? 0)) / price;
    const delta = desiredShares - currentShares;
    const amount = Math.abs(delta) * price;
    if (amount < minTradeAmount) continue;
    const trade: Trade = { symbol, side: delta > 0 ? 'buy' : 'sell', shares: Math.abs(delta), price, amount };
    (delta > 0 ? buys : sells).push(trade);
  }

  // Never spend more cash than exists after sells (guards against rounding).
  const available = state.cash + sells.reduce((s, t) => s + t.amount, 0);
  const wanted = buys.reduce((s, t) => s + t.amount, 0);
  if (wanted > available && wanted > 0) {
    const scale = available / wanted;
    for (const b of buys) {
      b.amount *= scale;
      b.shares *= scale;
    }
  }
  return [...sells, ...buys];
}

/** Apply trades to a portfolio. Selling reduces cost basis pro rata (average-cost method). */
export function applyTrades(state: PortfolioState, trades: Trade[]): PortfolioState {
  const holdings: Holdings = Object.fromEntries(
    Object.entries(state.holdings).map(([k, v]) => [k, { ...v }]),
  );
  let cash = state.cash;
  for (const t of trades) {
    const h = holdings[t.symbol] ?? { shares: 0, costBasis: 0 };
    if (t.side === 'buy') {
      if (t.amount > cash + 1e-6) throw new Error(`Not enough cash to buy ${t.symbol}.`);
      cash -= t.amount;
      h.shares += t.shares;
      h.costBasis += t.amount;
    } else {
      if (t.shares > h.shares + 1e-9) throw new Error(`Cannot sell more ${t.symbol} than is held.`);
      const fraction = h.shares > 0 ? Math.min(1, t.shares / h.shares) : 1;
      h.costBasis -= h.costBasis * fraction;
      h.shares -= t.shares;
      cash += t.amount;
    }
    if (h.shares < 1e-9) delete holdings[t.symbol];
    else holdings[t.symbol] = h;
  }
  return { cash: Math.max(0, cash), holdings };
}
