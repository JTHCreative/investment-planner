/** A target slice of a portfolio. `weight` is a fraction (0.25 = 25%). */
export interface Target {
  symbol: string;
  weight: number;
  name?: string;
  type?: string;
}

/** Shares held in one symbol. `costBasis` is the total dollars paid for the shares still held. */
export interface Holding {
  shares: number;
  costBasis: number;
}

export type Holdings = Record<string, Holding>;

export interface Portfolio {
  id: string;
  name: string;
  description?: string;
  startingCash: number;
  cash: number;
  holdings: Holdings;
  targets: Target[];
  createdAt: number;
  updatedAt: number;
}

export type TradeSide = 'buy' | 'sell';

export interface Trade {
  symbol: string;
  side: TradeSide;
  shares: number;
  price: number;
  /** shares * price, always positive. */
  amount: number;
}

export interface Transaction {
  id: string;
  type: TradeSide | 'deposit' | 'withdrawal';
  symbol?: string;
  shares?: number;
  price?: number;
  amount: number;
  at: number;
  note?: string;
}

/** A saved snapshot of a portfolio's target allocation, so plan changes are tracked over time. */
export interface Revision {
  id: string;
  targets: Target[];
  note?: string;
  createdAt: number;
}

export interface Quote {
  symbol: string;
  name: string;
  type: string;
  currency: string;
  exchange?: string;
  price: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  dividendYield?: number;
  marketCap?: number;
  trailingPE?: number;
  updatedAt: number;
}

export interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange?: string;
}

/** Daily dividend/split-adjusted closes. `dates` are YYYY-MM-DD, ascending. */
export interface PriceSeries {
  symbol: string;
  dates: string[];
  closes: number[];
}
