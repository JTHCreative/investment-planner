import { useRef } from 'react';
import { money, pct } from '../lib/format';
import { PRESETS } from '../lib/presets';
import type { Target } from '../lib/types';
import { AllocationPie, CASH_KEY, type PieSlice } from './AllocationPie';
import { SymbolSearch, typeLabel } from './SymbolSearch';

const PALETTE_SIZE = 8;

/**
 * Give each symbol a palette slot the first time it appears and keep it, so removing one holding never repaints the
 * others. Freed slots are reused by the next symbol added.
 */
function useStableColors(symbols: string[]): (symbol: string) => string {
  const slots = useRef(new Map<string, number>());
  const map = slots.current;
  for (const s of [...map.keys()]) if (!symbols.includes(s)) map.delete(s);
  for (const s of symbols) {
    if (map.has(s)) continue;
    const used = new Set(map.values());
    let slot = 0;
    while (used.has(slot) && slot < PALETTE_SIZE) slot++;
    // Past 8 holdings colors repeat; the table and labels still name every slice.
    map.set(s, slot < PALETTE_SIZE ? slot : map.size % PALETTE_SIZE);
  }
  return (symbol) => `var(--series-${(map.get(symbol) ?? 0) + 1})`;
}

/** Edit a list of target weights. Whatever isn't allocated is shown as cash. */
export function AllocationEditor({
  targets,
  onChange,
  amount,
}: {
  targets: Target[];
  onChange: (t: Target[]) => void;
  /** The size of the bucket being split, to show each slice in dollars. */
  amount: number;
}) {
  const total = targets.reduce((s, t) => s + t.weight, 0);
  const over = total > 1 + 1e-9;
  const cash = Math.max(0, 1 - total);
  const colorOf = useStableColors(targets.map((t) => t.symbol));

  function setWeight(i: number, percent: number) {
    const next = targets.slice();
    next[i] = { ...next[i], weight: Math.max(0, Math.min(100, percent || 0)) / 100 };
    onChange(next);
  }

  function spreadEvenly() {
    if (!targets.length) return;
    // Round to tenths of a percent and give the remainder to the first row so it sums to exactly 100%.
    const each = Math.floor(1000 / targets.length) / 1000;
    onChange(targets.map((t, i) => ({ ...t, weight: i === 0 ? 1 - each * (targets.length - 1) : each })));
  }

  const slices: PieSlice[] = [
    ...targets.map((t) => ({ key: t.symbol, label: t.symbol, weight: t.weight, color: colorOf(t.symbol) })),
    { key: CASH_KEY, label: 'Cash', weight: cash, color: 'var(--cash)' },
  ];

  return (
    <div className="stack">
      <div className="row wrap gap-sm">
        <span className="muted small">Start from:</span>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className="chip" title={p.description} onClick={() => onChange(p.targets)}>
            {p.name}
          </button>
        ))}
      </div>

      <SymbolSearch
        exclude={targets.map((t) => t.symbol)}
        onSelect={(r) => onChange([...targets, { symbol: r.symbol, name: r.name, type: r.type, weight: cash }])}
      />

      <div className="alloc-layout">
        <AllocationPie slices={slices} amount={amount} />

        <div className="table-wrap">
        <table className="table alloc-table">
          <thead>
            <tr>
              <th>Investment</th>
              <th className="num">Weight</th>
              <th className="num">Amount</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {targets.map((t, i) => (
              <tr key={t.symbol}>
                <td>
                  <span className="swatch" style={{ background: colorOf(t.symbol) }} />
                  <strong>{t.symbol}</strong> <span className="tag">{typeLabel(t.type)}</span>
                  <div className="muted small truncate">{t.name}</div>
                </td>
                <td className="num">
                  <input
                    className="weight-input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.5}
                    aria-label={`${t.symbol} weight percent`}
                    value={Math.round(t.weight * 1000) / 10}
                    onChange={(e) => setWeight(i, parseFloat(e.target.value))}
                  />
                  %
                </td>
                <td className="num">{money(t.weight * amount)}</td>
                <td className="num">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${t.symbol}`}
                    title={`Remove ${t.symbol}`}
                    onClick={() => onChange(targets.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            <tr className="muted">
              <td>
                <span className="swatch alloc-cash" />
                Cash (not invested)
              </td>
              <td className="num">{pct(cash)}</td>
              <td className="num">{money(cash * amount)}</td>
              <td />
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>Total invested</td>
              <td className={`num ${over ? 'error' : ''}`}>{pct(total)}</td>
              <td className={`num ${over ? 'error' : ''}`}>{money(total * amount)}</td>
              <td className="num">
                {targets.length > 1 && (
                  <button type="button" className="link" onClick={spreadEvenly}>
                      Split evenly
                  </button>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
      {over && <p className="error">Allocations add up to more than 100%. Lower some weights.</p>}
    </div>
  );
}
