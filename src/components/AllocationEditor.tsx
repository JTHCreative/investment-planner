import { pct } from '../lib/format';
import { PRESETS } from '../lib/presets';
import type { Target } from '../lib/types';
import { SymbolSearch, typeLabel } from './SymbolSearch';

/** Edit a list of target weights. Whatever isn't allocated is shown as cash. */
export function AllocationEditor({ targets, onChange }: { targets: Target[]; onChange: (t: Target[]) => void }) {
  const total = targets.reduce((s, t) => s + t.weight, 0);
  const over = total > 1 + 1e-9;

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
        onSelect={(r) => onChange([...targets, { symbol: r.symbol, name: r.name, type: r.type, weight: Math.max(0, 1 - total) }])}
      />

      {targets.length > 0 && (
        <div className="alloc-bar" aria-hidden>
          {targets.map((t, i) => (
            <span key={t.symbol} style={{ flexGrow: t.weight, background: `var(--series-${(i % 8) + 1})` }} title={`${t.symbol} ${pct(t.weight)}`} />
          ))}
          {total < 1 && <span style={{ flexGrow: 1 - total }} className="alloc-cash" title={`Cash ${pct(1 - total)}`} />}
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Investment</th>
            <th className="num">Weight</th>
            <th aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {targets.map((t, i) => (
            <tr key={t.symbol}>
              <td>
                <span className="swatch" style={{ background: `var(--series-${(i % 8) + 1})` }} />
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
              <td className="num">
                <button type="button" className="link danger" onClick={() => onChange(targets.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
          <tr className="muted">
            <td>
              <span className="swatch alloc-cash" />
              Cash (not invested)
            </td>
            <td className="num">{pct(Math.max(0, 1 - total))}</td>
            <td />
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>Total invested</td>
            <td className={`num ${over ? 'error' : ''}`}>{pct(total)}</td>
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
      {over && <p className="error">Allocations add up to more than 100%. Lower some weights.</p>}
    </div>
  );
}
