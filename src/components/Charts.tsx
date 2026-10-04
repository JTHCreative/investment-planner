import { useId, type ReactNode } from 'react';
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
    <div className="chart" style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
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
    </div>
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
    <div className="chart" style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
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
    </div>
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
    <div className="chart" style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
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
    </div>
  );
}
