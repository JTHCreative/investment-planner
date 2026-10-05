import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { money, moneyCompact } from '../lib/format';
import { canZoom, fullView, isFull, panBy, toRange, withZoomLevel, zoomBy, zoomLevel, type ZoomView } from '../lib/zoom';
import { MinusIcon, PlusIcon } from './Icons';
import type { ProjectionPoint } from '../lib/sim/simulate';

const axisProps = {
  stroke: 'var(--grid)',
  tick: { fill: 'var(--text-muted)', fontSize: 12 },
  tickLine: false,
};

const grid = <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" vertical={false} />;

/** Six Lunar chart colors, in an order where neighbours stay distinguishable. Index by series position; past six they repeat. */
export const SERIES_COLORS = [
  'var(--series-1)',
  'var(--series-2)',
  'var(--series-3)',
  'var(--series-4)',
  'var(--series-5)',
  'var(--series-6)',
];

function ChartTooltip({ label, rows }: { label: ReactNode; rows: [string, string, string?][] }) {
  return (
    <div className="tooltip">
      <div className="muted xsmall">{label}</div>
      {rows.map(([name, value, color]) => (
        <div key={name} className="row" style={{ gap: 8 }}>
          {color && <span className="swatch" style={{ background: color }} />}
          <span className="muted">{name}</span>
          <span className="num-font" style={{ marginLeft: 'auto' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/** Where the plot sits inside each chart box: the margin and Y axis on the left, the margin on the right. */
const PLOT_LEFT = 4 + 60;
const PLOT_RIGHT = 8;
/** How much one notch of a mouse wheel zooms. Trackpads send smaller steps, which zoom proportionally less. */
const WHEEL_ZOOM = 0.0025;

/**
 * A chart box that can be zoomed and moved through time: drag to move earlier or later, scroll to zoom around the
 * pointer, or use the zoom bar above the chart. `children` draws the chart for the visible slice `data.slice(from, to)`.
 * The view goes back to showing everything whenever `resetKey` changes (e.g. a new date range was picked).
 */
function ZoomableChart({
  count,
  resetKey,
  height,
  children,
}: {
  count: number;
  resetKey: string;
  height: number;
  children: (from: number, to: number) => ReactNode;
}) {
  const enabled = canZoom(count);
  const [state, setState] = useState<{ key: string; view: ZoomView }>({ key: resetKey, view: fullView(count) });
  const view = state.key === resetKey ? state.view : fullView(count);
  const viewRef = useRef(view);
  viewRef.current = view;
  const setView = (v: ZoomView) => {
    viewRef.current = v;
    setState({ key: resetKey, view: v });
  };
  const setViewRef = useRef(setView);
  setViewRef.current = setView;

  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; view: ZoomView } | null>(null);
  const [dragging, setDragging] = useState(false);

  const plotWidth = () => Math.max(1, (boxRef.current?.clientWidth ?? 1) - PLOT_LEFT - PLOT_RIGHT);

  // The wheel listener is attached by hand because React's is passive and can't stop the page from scrolling.
  // The page still scrolls when the chart can't zoom any further that way.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !enabled) return;
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current;
      const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1; // lines or pages to pixels
      const dy = Math.max(-200, Math.min(200, e.deltaY * scale));
      const dx = e.deltaX * scale;
      let next = v;
      if (Math.abs(dx) > Math.abs(dy)) {
        // Sideways trackpad swipe: move through time.
        next = panBy(v, count, (dx / plotWidth()) * v.size);
      } else if (dy !== 0) {
        const rect = box.getBoundingClientRect();
        const anchor = (e.clientX - rect.left - PLOT_LEFT) / plotWidth();
        next = zoomBy(v, count, Math.exp(dy * WHEEL_ZOOM), anchor);
      }
      if (next.start === v.start && next.size === v.size) return;
      e.preventDefault();
      setViewRef.current(next);
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, [enabled, count]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || e.button !== 0 || isFull(viewRef.current, count)) return;
    drag.current = { pointer: e.pointerId, x: e.clientX, view: viewRef.current };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    // Dragging right pulls earlier dates into view, like sliding a sheet of paper.
    setView(panBy(d.view, count, (-(e.clientX - d.x) / plotWidth()) * d.view.size));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
  };

  const [from, to] = enabled ? toRange(view, count) : [0, count];
  const full = !enabled || isFull(view, count);
  const level = enabled ? zoomLevel(view, count) : 0;
  const step = (dir: 1 | -1) => setView(withZoomLevel(view, count, level + dir * 0.1));

  return (
    <div className="chart-zoom">
      {enabled && (
        <div className="zoom-bar">
          <span className="zoom-hint xsmall muted">{full ? 'Scroll or use the bar to zoom' : 'Drag the chart to move through time'}</span>
          <button type="button" className="icon-btn sm" aria-label="Zoom out" disabled={full} onClick={() => step(-1)}>
            <MinusIcon size={14} />
          </button>
          <input
            type="range"
            className="zoom-slider"
            min={0}
            max={1000}
            value={Math.round(level * 1000)}
            aria-label="Zoom"
            aria-valuetext={`Showing ${to - from} of ${count} points`}
            onChange={(e) => setView(withZoomLevel(view, count, Number(e.target.value) / 1000))}
          />
          <button type="button" className="icon-btn sm" aria-label="Zoom in" disabled={level >= 1} onClick={() => step(1)}>
            <PlusIcon size={14} />
          </button>
          <button type="button" className="btn-link xsmall" disabled={full} onClick={() => setView(fullView(count))}>
            Reset
          </button>
        </div>
      )}
      <div
        ref={boxRef}
        className={`chart${enabled ? ' zoomable' : ''}${full ? '' : ' pannable'}${dragging ? ' dragging' : ''}`}
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children(from, to)}
      </div>
    </div>
  );
}

const resetKeyOf = (data: Record<string, unknown>[], xKey: string) =>
  `${data.length}|${String(data[0]?.[xKey] ?? '')}|${String(data.at(-1)?.[xKey] ?? '')}`;

export interface LegendItem {
  label: string;
  color: string;
  kind?: 'line' | 'dash' | 'block';
}

/** Plain legend under a chart: text stays in muted ink, the mark beside it carries the color. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          {i.kind === 'dash' ? (
            <span className="dash" style={{ color: i.color }} />
          ) : (
            <span className={i.kind === 'block' ? 'blk' : 'ln'} style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** One dollar series over time, with a soft fill underneath and an optional dashed reference (e.g. starting cash). */
export function AreaValueChart({
  data,
  xKey,
  valueKey,
  label,
  baseline,
  baselineLabel,
  height = 268,
}: {
  data: Record<string, number | string>[];
  xKey: string;
  valueKey: string;
  label: string;
  baseline?: number;
  baselineLabel?: string;
  height?: number;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <ZoomableChart count={data.length} resetKey={resetKeyOf(data, xKey)} height={height}>
      {(from, to) => (
        <ResponsiveContainer>
          <AreaChart data={data.slice(from, to)} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={`fill${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#135CC5" stopOpacity={0.35} />
                <stop offset="1" stopColor="#135CC5" stopOpacity={0} />
              </linearGradient>
            </defs>
            {grid}
            <XAxis dataKey={xKey} {...axisProps} minTickGap={48} />
            <YAxis {...axisProps} axisLine={false} tickFormatter={moneyCompact} width={60} domain={['auto', 'auto']} />
            <Tooltip
              cursor={{ stroke: 'var(--text-faint)', strokeDasharray: '3 3' }}
              content={({ active, payload, label: l }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    label={l}
                    rows={[
                      [label, money(Number(payload[0].value)), 'var(--line)'],
                      ...(baseline !== undefined && baselineLabel ? [[baselineLabel, money(baseline)] as [string, string]] : []),
                    ]}
                  />
                ) : null
              }
            />
            {baseline !== undefined && <ReferenceLine y={baseline} stroke="var(--text-faint)" strokeDasharray="5 4" />}
            <Area
              type="monotone"
              dataKey={valueKey}
              name={label}
              stroke="var(--line)"
              strokeWidth={2.5}
              fill={`url(#fill${id})`}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)', fill: 'var(--line)' }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ZoomableChart>
  );
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

/** Several dollar-valued lines over time, sharing a single axis. Pair with ChartLegend. */
export function ValueLineChart({
  data,
  series,
  xKey,
  height = 308,
}: {
  data: Record<string, number | string>[];
  series: LineSeries[];
  xKey: string;
  height?: number;
}) {
  return (
    <ZoomableChart count={data.length} resetKey={resetKeyOf(data, xKey)} height={height}>
      {(from, to) => (
        <ResponsiveContainer>
          <LineChart data={data.slice(from, to)} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            {grid}
            <XAxis dataKey={xKey} {...axisProps} minTickGap={48} />
            <YAxis {...axisProps} axisLine={false} tickFormatter={moneyCompact} width={60} domain={[0, 'auto']} />
            <Tooltip
              cursor={{ stroke: 'var(--text-faint)', strokeDasharray: '3 3' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    label={label}
                    rows={series.map((s) => {
                      const v = payload.find((x) => x.dataKey === s.key)?.value;
                      return [s.label, v === undefined ? '—' : money(Number(v)), s.color] as [string, string, string];
                    })}
                  />
                ) : null
              }
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={s.dashed ? 1.5 : 2.5}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </ZoomableChart>
  );
}

/** Monte Carlo "fan": the median line, with bands holding the middle 50% and 80% of outcomes. */
export function FanChart({ points, height = 348 }: { points: ProjectionPoint[]; height?: number }) {
  const data = points.map((p) => ({
    ...p,
    label: `Yr ${p.year}`,
    outer: [p.p10, p.p90],
    inner: [p.p25, p.p75],
  }));
  return (
    <ZoomableChart count={data.length} resetKey={resetKeyOf(data, 'label')} height={height}>
      {(from, to) => (
        <ResponsiveContainer>
          <ComposedChart data={data.slice(from, to)} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
            {grid}
            <XAxis dataKey="label" {...axisProps} minTickGap={28} />
            <YAxis {...axisProps} axisLine={false} tickFormatter={moneyCompact} width={60} />
            <Tooltip
              cursor={{ stroke: 'var(--text-faint)', strokeDasharray: '3 3' }}
              content={({ active, payload, label }) => {
                const row = active && (payload?.[0]?.payload as ProjectionPoint | undefined);
                if (!row) return null;
                return (
                  <ChartTooltip
                    label={label}
                    rows={[
                      ['Optimistic (90th)', money(row.p90)],
                      ['Good (75th)', money(row.p75)],
                      ['Median', money(row.p50), 'var(--text)'],
                      ['Poor (25th)', money(row.p25)],
                      ['Pessimistic (10th)', money(row.p10)],
                      ['Total put in', money(row.contributed)],
                    ]}
                  />
                );
              }}
            />
            <Area dataKey="outer" stroke="none" fill="var(--band-outer)" fillOpacity={1} isAnimationActive={false} />
            <Area dataKey="inner" stroke="none" fill="var(--band-inner)" fillOpacity={1} isAnimationActive={false} />
            <Line dataKey="contributed" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line
              dataKey="p50"
              stroke="var(--text)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)', fill: 'var(--text)' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ZoomableChart>
  );
}
