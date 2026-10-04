import type { Target } from './types';

export interface Preset {
  name: string;
  description: string;
  targets: Target[];
}

/** Well-known example mixes to start from. Starting points for experimenting, not recommendations. */
export const PRESETS: Preset[] = [
  {
    name: 'Three-fund',
    description: 'US stocks, international stocks, and bonds.',
    targets: [
      { symbol: 'VTI', weight: 0.6, name: 'Vanguard Total Stock Market ETF', type: 'ETF' },
      { symbol: 'VXUS', weight: 0.2, name: 'Vanguard Total International Stock ETF', type: 'ETF' },
      { symbol: 'BND', weight: 0.2, name: 'Vanguard Total Bond Market ETF', type: 'ETF' },
    ],
  },
  {
    name: 'Classic 60/40',
    description: '60% S&P 500, 40% investment-grade bonds.',
    targets: [
      { symbol: 'VOO', weight: 0.6, name: 'Vanguard S&P 500 ETF', type: 'ETF' },
      { symbol: 'BND', weight: 0.4, name: 'Vanguard Total Bond Market ETF', type: 'ETF' },
    ],
  },
  {
    name: 'Conservative',
    description: 'Mostly bonds and T-bills, with some stocks.',
    targets: [
      { symbol: 'VTI', weight: 0.3, name: 'Vanguard Total Stock Market ETF', type: 'ETF' },
      { symbol: 'VXUS', weight: 0.1, name: 'Vanguard Total International Stock ETF', type: 'ETF' },
      { symbol: 'BND', weight: 0.45, name: 'Vanguard Total Bond Market ETF', type: 'ETF' },
      { symbol: 'SGOV', weight: 0.15, name: 'iShares 0-3 Month Treasury Bond ETF', type: 'ETF' },
    ],
  },
  {
    name: 'Growth',
    description: 'All stocks, tilted toward large US tech.',
    targets: [
      { symbol: 'VTI', weight: 0.7, name: 'Vanguard Total Stock Market ETF', type: 'ETF' },
      { symbol: 'VXUS', weight: 0.2, name: 'Vanguard Total International Stock ETF', type: 'ETF' },
      { symbol: 'QQQ', weight: 0.1, name: 'Invesco QQQ Trust', type: 'ETF' },
    ],
  },
  {
    name: 'All-weather style',
    description: 'Balanced across stocks, long and mid bonds, gold, and commodities.',
    targets: [
      { symbol: 'VTI', weight: 0.3, name: 'Vanguard Total Stock Market ETF', type: 'ETF' },
      { symbol: 'TLT', weight: 0.4, name: 'iShares 20+ Year Treasury Bond ETF', type: 'ETF' },
      { symbol: 'IEF', weight: 0.15, name: 'iShares 7-10 Year Treasury Bond ETF', type: 'ETF' },
      { symbol: 'GLD', weight: 0.075, name: 'SPDR Gold Shares', type: 'ETF' },
      { symbol: 'DBC', weight: 0.075, name: 'Invesco DB Commodity Index Tracking Fund', type: 'ETF' },
    ],
  },
];
