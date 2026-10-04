import { useEffect, useRef, useState } from 'react';
import { money, moneyExact, pct } from '../lib/format';

export interface PieSlice {
  key: string;
  label: string;
  weight: number;
  color: string;
}

const DURATION_MS = 650;
const SIZE = 240;
const R_OUTER = 112;
const R_INNER = 66;
const CX = SIZE / 2;
const CY = SIZE / 2;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Point on a circle, measured clockwise from 12 o'clock. */
function polar(r: number, angle: number): [number, number] {
  return [CX + r * Math.sin(angle), CY - r * Math.cos(angle)];
}

/** Ring segment from angle a0 to a1 (radians, clockwise from 12 o'clock). */
function arcPath(a0: number, a1: number): string {
  const sweep = a1 - a0;
  if (sweep <= 1e-4) return '';
  // A full circle can't be drawn as one arc; split it in two.
  if (sweep >= 2 * Math.PI - 1e-4) return arcPath(a0, a0 + Math.PI) + arcPath(a0 + Math.PI, a0 + 2 * Math.PI - 1e-4);
  const large = sweep > Math.PI ? 1 : 0;
  const [x0, y0] = polar(R_OUTER, a0);
  const [x1, y1] = polar(R_OUTER, a1);
  const [x2, y2] = polar(R_INNER, a1);
  const [x3, y3] = polar(R_INNER, a0);
  return `M${x0},${y0} A${R_OUTER},${R_OUTER} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${R_INNER},${R_INNER} 0 ${large} 0 ${x3},${y3} Z`;
}

interface Frame {
  /** Slices currently drawn, including ones animating out. */
  order: PieSlice[];
  weights: Map<string, number>;
  /** 0→1 clockwise reveal of the whole pie, used when it first appears. */
  reveal: number;
}

/**
 * Keep the new order, but leave slices that are being removed where they were so they can shrink in place
 * instead of jumping to the end.
 */
function mergeOrder(prev: PieSlice[], next: PieSlice[]): PieSlice[] {
  const nextKeys = new Set(next.map((s) => s.key));
  const merged = [...next];
  prev.forEach((s, i) => {
    if (nextKeys.has(s.key)) return;
    const before = prev.slice(0, i).reverse().find((p) => nextKeys.has(p.key));
    const at = before ? merged.findIndex((m) => m.key === before.key) + 1 : 0;
    merged.splice(at, 0, s);
  });
  return merged;
}

/**
 * Donut chart of how a bucket of money is split. When the split changes, every slice's share tweens from old to new:
 * a new holding sweeps in from zero width like a clock hand, removed ones shrink away, and the rest slide to make room.
 */
export function AllocationPie({ slices, amount }: { slices: PieSlice[]; amount: number }) {
  const [frame, setFrame] = useState<Frame>(() => ({
    order: slices,
    weights: new Map(slices.map((s) => [s.key, s.weight])),
    reveal: prefersReducedMotion() ? 1 : 0,
  }));
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const [active, setActive] = useState<string | null>(null);

  // First appearance: a clockwise wipe from 12 o'clock.
  useEffect(() => {
    if (frameRef.current.reveal >= 1) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (DURATION_MS * 1.3));
      setFrame((f) => ({ ...f, reveal: easeInOutCubic(t) }));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Every change afterwards: tween each slice's share from wherever it is now.
  const signature = slices.map((s) => `${s.key}:${s.weight.toFixed(5)}:${s.color}`).join('|');
  useEffect(() => {
    const from = frameRef.current;
    const order = mergeOrder(from.order, slices);
    const target = new Map(slices.map((s) => [s.key, s.weight]));
    const startWeights = new Map(order.map((s) => [s.key, from.weights.get(s.key) ?? 0]));

    if (prefersReducedMotion()) {
      setFrame({ order: slices, weights: target, reveal: 1 });
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const e = easeInOutCubic(t);
      const weights = new Map<string, number>();
      for (const s of order) {
        const a = startWeights.get(s.key) ?? 0;
        const b = target.get(s.key) ?? 0;
        weights.set(s.key, a + (b - a) * e);
      }
      // Once finished, drop the slices that shrank to nothing.
      setFrame((f) => ({ ...f, order: t < 1 ? order : slices, weights }));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [signature]);

  const totalWeight = frame.order.reduce((s, x) => s + (frame.weights.get(x.key) ?? 0), 0) || 1;
  let cursor = 0;
  const arcs = frame.order.map((s) => {
    const w = (frame.weights.get(s.key) ?? 0) / totalWeight;
    const a0 = cursor * 2 * Math.PI * frame.reveal;
    cursor += w;
    const a1 = cursor * 2 * Math.PI * frame.reveal;
    return { slice: s, a0, a1 };
  });

  const activeSlice = slices.find((s) => s.key === active);
  const invested = slices.filter((s) => s.key !== CASH_KEY).reduce((sum, s) => sum + s.weight, 0);
  const summary = slices.map((s) => `${s.label} ${pct(s.weight)} (${money(s.weight * amount)})`).join(', ');

  return (
    <figure className="pie">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Allocation of ${money(amount)}: ${summary}`}>
        <circle cx={CX} cy={CY} r={(R_OUTER + R_INNER) / 2} fill="none" stroke="var(--surface-2)" strokeWidth={R_OUTER - R_INNER} />
        {arcs.map(({ slice, a0, a1 }) => (
          <path
            key={slice.key}
            d={arcPath(a0, a1)}
            fill={slice.color}
            stroke="var(--surface)"
            strokeWidth={2}
            strokeLinejoin="round"
            className={active && active !== slice.key ? 'pie-dim' : undefined}
            onPointerEnter={() => setActive(slice.key)}
            onPointerLeave={() => setActive(null)}
            onClick={() => setActive((a) => (a === slice.key ? null : slice.key))}
          />
        ))}
        <text x={CX} y={CY - 12} textAnchor="middle" className="pie-label">
          {activeSlice ? activeSlice.label : 'Invested'}
        </text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="pie-value">
          {activeSlice ? money(activeSlice.weight * amount) : pct(invested, invested < 1 && invested > 0 ? 1 : 0)}
        </text>
        <text x={CX} y={CY + 34} textAnchor="middle" className="pie-label">
          {activeSlice ? pct(activeSlice.weight) : `of ${moneyExact(amount)}`}
        </text>
      </svg>
      <figcaption>
        {slices
          .filter((s) => s.weight >= 0.0005)
          .map((s) => (
            <span key={s.key}>
              <span className="swatch" style={{ background: s.color }} />
              {s.label} {pct(s.weight, s.weight * 100 % 1 ? 1 : 0)}
            </span>
          ))}
      </figcaption>
    </figure>
  );
}

export const CASH_KEY = '__cash';
