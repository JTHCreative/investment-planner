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

/** What someone a portfolio is shared with may do: look at it, or also trade and change its plan. */
export type Role = 'view' | 'edit';

export interface Portfolio {
  id: string;
  /** The account the portfolio belongs to (from its path, users/{ownerId}/portfolios/{id}). */
  ownerId: string;
  name: string;
  description?: string;
  startingCash: number;
  cash: number;
  holdings: Holdings;
  targets: Target[];
  createdAt: number;
  updatedAt: number;
  /** People the owner has shared it with, by account id. */
  members?: Record<string, Role>;
  /** The keys of `members`, kept alongside so Firestore can find everything shared with one person. */
  memberIds?: string[];
}

/** A group of portfolios on the home page. Folders are personal: each person files shared portfolios their own way. */
export interface Folder {
  id: string;
  name: string;
  color: FolderColor;
  icon: FolderIconName;
  createdAt: number;
}

export type FolderColor = 'blue' | 'teal' | 'green' | 'orange' | 'red' | 'pink' | 'purple' | 'grey';
export type FolderIconName =
  | 'briefcase' | 'piggy-bank' | 'wallet' | 'landmark' | 'coins' | 'gem' | 'trending-up' | 'chart-pie' | 'target' | 'rocket'
  | 'shield' | 'house' | 'graduation-cap' | 'baby' | 'heart' | 'star' | 'plane' | 'leaf' | 'globe' | 'users';

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
