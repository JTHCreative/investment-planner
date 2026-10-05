import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { pct } from '../lib/format';

export interface LabeledSlice {
  key: string;
  /** Short name drawn on the slice when it fits, e.g. a ticker. */
  label: string;
  /** Longer name for the tooltip, e.g. the fund's full name. */
  name?: string;
  /** Fraction of the whole (0.25 = 25%). */
  weight: number;
  color: string;
}

const SIZE = 200;
const R = 96;
const C = SIZE / 2;
/** Labels sit this far out from the centre, as a share of the radius. */
const LABEL_R = 0.64;
const LABEL_FONT = 11;

function polar(r: number, angle: number): [number, number] {
  return [C + r * Math.sin(angle), C - r * Math.cos(angle)];
}

/** Pie wedge from angle a0 to a1 (radians, clockwise from 12 o'clock). */
function wedge(a0: number, a1: number): string {
  const [x0, y0] = polar(R, a0);
  const [x1, y1] = polar(R, a1);
  return `M${C},${C} L${x0},${y0} A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1} Z`;
}

/** Rough width of a label in SVG units: wide enough to decide whether it fits, without measuring text. */
const labelWidth = (text: string) => text.length * LABEL_FONT * 0.62 + 6;

/**
 * Pie chart with each slice's name written on it when there's room. Hovering (or tapping) a slice shows a tooltip
 * with its full name and share.
 */
export function LabeledPie({ slices, label }: { slices: LabeledSlice[]; label: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const total = slices.reduce((s, x) => s + x.weight, 0) || 1;

  let cursor = 0;
  const arcs = slices.map((s) => {
    const a0 = (cursor / total) * 2 * Math.PI;
    cursor += s.weight;
    const a1 = (cursor / total) * 2 * Math.PI;
    const mid = (a0 + a1) / 2;
    const [lx, ly] = polar(R * LABEL_R, mid);
    // A label fits when the wedge is wider than the text at the label's distance from the centre.
    const room = (a1 - a0) * R * LABEL_R;
    const fits = a1 - a0 >= 2 * Math.PI - 1e-6 || (room > labelWidth(s.label) && a1 - a0 > 0.3);
    return { slice: s, a0, a1, lx, ly, fits };
  });

  const track = (key: string, e: ReactPointerEvent) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) setHover({ key, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const hovered = hover && slices.find((s) => s.key === hover.key);
  const width = boxRef.current?.clientWidth ?? 0;
  const summary = slices.map((s) => `${s.label} ${pct(s.weight / total, 1)}`).join(', ');

  return (
    <div className="labeled-pie" ref={boxRef} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${label}: ${summary}`}>
        {arcs.map(({ slice, a0, a1 }) =>
          a1 - a0 >= 2 * Math.PI - 1e-6 ? (
            <circle
              key={slice.key}
              cx={C}
              cy={C}
              r={R}
              fill={slice.color}
              onPointerMove={(e) => track(slice.key, e)}
              onPointerDown={(e) => track(slice.key, e)}
            />
          ) : (
            <path
              key={slice.key}
              d={wedge(a0, a1)}
              fill={slice.color}
              stroke="var(--surface)"
              strokeWidth={1.5}
              strokeLinejoin="round"
              className={hover && hover.key !== slice.key ? 'pie-dim' : undefined}
              onPointerMove={(e) => track(slice.key, e)}
              onPointerDown={(e) => track(slice.key, e)}
            />
          ),
        )}
        {arcs.map(({ slice, lx, ly, fits }) =>
          fits ? (
            <text key={slice.key} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" className="pie-slice-label" fontSize={LABEL_FONT}>
              {slice.label}
            </text>
          ) : null,
        )}
      </svg>
      {hover && hovered && (
        <div
          className="tooltip pie-tooltip"
          style={{
            top: hover.y + 14,
            // Flip to the left of the pointer near the right edge so the tooltip stays inside the panel.
            ...(hover.x > width / 2 ? { right: width - hover.x + 14 } : { left: hover.x + 14 }),
          }}
        >
          <div className="row" style={{ gap: 8 }}>
            <span className="swatch" style={{ background: hovered.color }} />
            <span>{hovered.label}</span>
            <span className="num-font" style={{ marginLeft: 'auto', paddingLeft: 12 }}>{pct(hovered.weight / total, 1)}</span>
          </div>
          {hovered.name && hovered.name !== hovered.label && <div className="muted xsmall">{hovered.name}</div>}
        </div>
      )}
    </div>
  );
}
