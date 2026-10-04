import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { money, moneyCompact } from '../lib/format';
import type { ProjectionPoint } from '../lib/sim/simulate';

const axisProps = {
  stroke: 'var(--axis)',
  tick: { fill: 'var(--text-muted)', fontSize: 12 },
  tickLine: false,
};

const tooltipStyle = {
  contentStyle: {
    background: 'var(--surface-raised)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 13,
  },
  labelStyle: { color: 'var(--text-muted)' },
};

// Legend text stays in the muted ink; the swatch beside it carries the series color.
const legendText = (value: string) => <span style={{ color: 'var(--text-muted)' }}>{value}</span>;

export const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

/** One or more dollar-valued lines over time, sharing a single axis. */
export function ValueLineChart({
  data,
  series,
  xKey,
  height = 280,
}: {
  data: Record<string, number | string>[];
  series: LineSeries[];
  xKey: string;
  height?: number;
}) {
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} minTickGap={40} />
          <YAxis {...axisProps} tickFormatter={moneyCompact} width={64} domain={['auto', 'auto']} axisLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v) => money(Number(v))} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendText} />}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
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

/** Monte Carlo "fan": the middle line is the median outcome, bands hold the middle 50% and 80% of outcomes. */
export function FanChart({ points, height = 320 }: { points: ProjectionPoint[]; height?: number }) {
  const data = points.map((p) => ({
    year: `Yr ${p.year}`,
    outer: [p.p10, p.p90],
    inner: [p.p25, p.p75],
    p10: p.p10,
    p25: p.p25,
    p50: p.p50,
    p75: p.p75,
    p90: p.p90,
    contributed: p.contributed,
  }));
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="year" {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} tickFormatter={moneyCompact} width={64} axisLine={false} />
          <Tooltip
            {...tooltipStyle}
            content={({ active, payload, label }) => {
              const row = active && payload?.[0]?.payload;
              if (!row) return null;
              return (
                <div className="tooltip">
                  <div className="muted">{label}</div>
                  <div>Optimistic (90th): <strong>{money(row.p90)}</strong></div>
                  <div>Good (75th): {money(row.p75)}</div>
                  <div>Median: <strong>{money(row.p50)}</strong></div>
                  <div>Poor (25th): {money(row.p25)}</div>
                  <div>Pessimistic (10th): <strong>{money(row.p10)}</strong></div>
                  <div className="muted">Total put in: {money(row.contributed)}</div>
                </div>
              );
            }}
          />
          <Area dataKey="outer" name="10th–90th percentile" stroke="none" fill="var(--band-outer)" isAnimationActive={false} />
          <Area dataKey="inner" name="25th–75th percentile" stroke="none" fill="var(--band-inner)" isAnimationActive={false} />
          <Line dataKey="p50" name="Median" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line
            dataKey="contributed"
            name="Total put in"
            stroke="var(--text-muted)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
          />
          <Legend wrapperStyle={{ fontSize: 13 }} formatter={legendText} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
