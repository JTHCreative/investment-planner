import { useState } from 'react';
import { pct } from '../lib/format';
import type { Portfolio } from '../lib/types';
import { SERIES_COLORS } from './Charts';
import { CloseIcon } from './Icons';
import { LabeledPie, type LabeledSlice } from './LabeledPie';

/** A plan's target split as pie slices, largest first, with any unallocated share shown as cash. */
export function planSlices(p: Portfolio): LabeledSlice[] {
  const targets = p.targets.filter((t) => t.weight > 0).sort((a, b) => b.weight - a.weight);
  const slices: LabeledSlice[] = targets.map((t, i) => ({
    key: t.symbol,
    label: t.symbol,
    name: t.name,
    weight: t.weight,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));
  const cash = 1 - targets.reduce((s, t) => s + t.weight, 0);
  if (cash > 0.0005) slices.push({ key: '__cash', label: 'Cash', weight: cash, color: 'var(--cash)' });
  return slices;
}

/** What one plan holds, as a pie chart or a list. */
export function PlanAssets({ portfolio, color, onClose }: { portfolio: Portfolio; color: string; onClose: () => void }) {
  const [mode, setMode] = useState<'chart' | 'list'>('chart');
  const slices = planSlices(portfolio);

  return (
    <div className="plan-assets">
      <div className="plan-assets-head">
        <h3 className="row" style={{ gap: 10, minWidth: 0 }}>
          <span className="swatch" style={{ background: color }} />
          <span className="truncate">{portfolio.name}</span>
        </h3>
        <button type="button" className="icon-btn sm" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Show assets as">
        <button role="radio" aria-checked={mode === 'chart'} className={mode === 'chart' ? 'active' : ''} onClick={() => setMode('chart')}>
          Chart
        </button>
        <button role="radio" aria-checked={mode === 'list'} className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>
          List
        </button>
      </div>
      {mode === 'chart' ? (
        // Keyed by plan so switching plans replays the pie's entrance.
        <LabeledPie key={portfolio.id} slices={slices} label={`What ${portfolio.name} holds`} />
      ) : (
        <ul className="asset-list">
          {slices.map((s) => (
            <li key={s.key}>
              <span className="swatch" style={{ background: s.color }} />
              <span className="asset-list-name">
                {s.label}
                {s.name && s.name !== s.label && <span className="muted xsmall">{s.name}</span>}
              </span>
              <span className="num-font">{pct(s.weight)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
