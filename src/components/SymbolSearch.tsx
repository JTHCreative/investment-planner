import { useEffect, useRef, useState } from 'react';
import { errorMessage, searchSymbols } from '../lib/market';
import type { SearchResult } from '../lib/types';

const TYPE_LABEL: Record<string, string> = {
  EQUITY: 'Stock',
  ETF: 'ETF',
  MUTUALFUND: 'Fund',
  INDEX: 'Index',
  CRYPTOCURRENCY: 'Crypto',
  MONEYMARKET: 'Money market',
};

export const typeLabel = (t?: string) => (t ? TYPE_LABEL[t] ?? t : '');

export function SymbolSearch({
  onSelect,
  placeholder = 'Search stocks, ETFs, bond funds…',
  exclude = [],
}: {
  onSelect: (r: SearchResult) => void;
  placeholder?: string;
  exclude?: string[];
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchSymbols(q);
        if (id === seq.current) {
          setResults(r);
          setError('');
        }
      } catch (e) {
        if (id === seq.current) setError(errorMessage(e));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function choose(r: SearchResult) {
    onSelect(r);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  const shown = results.filter((r) => !exclude.includes(r.symbol));

  return (
    <div className="search" onBlur={() => setTimeout(() => setOpen(false), 150)}>
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        aria-label="Search symbols"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && shown[0]) {
            e.preventDefault();
            choose(shown[0]);
          }
        }}
      />
      {open && query.trim() && (
        <ul className="search-results" role="listbox">
          {loading && !shown.length && <li className="muted">Searching…</li>}
          {error && <li className="error">{error}</li>}
          {!loading && !error && !shown.length && <li className="muted">No matches</li>}
          {shown.map((r) => (
            <li key={r.symbol} role="option" aria-selected={false}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)}>
                <strong>{r.symbol}</strong>
                <span className="truncate">{r.name}</span>
                <span className="tag">{typeLabel(r.type)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
