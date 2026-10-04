const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

export const money = (n: number) => (Number.isFinite(n) ? usd0.format(n) : '—');
export const moneyExact = (n: number) => (Number.isFinite(n) ? usd2.format(n) : '—');
export const moneyCompact = (n: number) => (Number.isFinite(n) ? compact.format(n) : '—');

export function pct(n: number | undefined, digits = 1, signed = false): string {
  if (n === undefined || !Number.isFinite(n)) return '—';
  const s = (n * 100).toFixed(digits) + '%';
  return signed && n > 0 ? '+' + s : s;
}

export function shares(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function date(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "2024-03" → "Mar 2024" */
export function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** "+$1,234.56" / "−$1,234.56" (true minus sign), for gains and losses. */
export function signedMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return (n < 0 ? '−' : '+') + usd2.format(Math.abs(n));
}

/** Percent with a true minus sign, e.g. "−3.12%". */
export function pctSigned(n: number | undefined, digits = 1): string {
  return pct(n, digits, true).replace('-', '−');
}
