// Mirrors src/lib/types.ts in the web app.

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

export interface History {
  symbol: string;
  dates: string[];
  closes: number[];
}

/** Anything that can supply market data. Swap implementations without touching the app. */
export interface MarketProvider {
  search(query: string): Promise<SearchResult[]>;
  quotes(symbols: string[]): Promise<Quote[]>;
  /** Daily dividend/split-adjusted closes, oldest first. */
  history(symbol: string): Promise<History>;
}
