/**
 * The visible part of a chart, measured in data points. Both numbers are fractional so that small drags and gentle
 * trackpad scrolls add up instead of being rounded away; `toRange` turns them into whole points to slice the data by.
 */
export interface ZoomView {
  /** First visible point (may be fractional). */
  start: number;
  /** How many points are visible (may be fractional). */
  size: number;
}

/** The most a chart can be zoomed in: this many points stay on screen. */
export const MIN_POINTS = 6;

export const canZoom = (count: number) => count > MIN_POINTS;

export const fullView = (count: number): ZoomView => ({ start: 0, size: count });

const minSize = (count: number) => Math.min(count, MIN_POINTS);
const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampView(v: ZoomView, count: number): ZoomView {
  const size = clampNum(v.size, minSize(count), count);
  return { start: clampNum(v.start, 0, count - size), size };
}

export const isFull = (v: ZoomView, count: number) => v.size >= count - 1e-6;

/**
 * Zoom by `factor` (below 1 zooms in, above 1 zooms out), keeping the point under `anchor` where it is.
 * `anchor` is a position across the chart from 0 (left edge) to 1 (right edge).
 */
export function zoomBy(v: ZoomView, count: number, factor: number, anchor = 0.5): ZoomView {
  const a = clampNum(anchor, 0, 1);
  const size = clampNum(v.size * factor, minSize(count), count);
  return clampView({ start: v.start + a * v.size - a * size, size }, count);
}

/** Move the view later (positive) or earlier (negative) by a number of points. */
export const panBy = (v: ZoomView, count: number, points: number): ZoomView => clampView({ start: v.start + points, size: v.size }, count);

/** The whole points to show: slice the data with `data.slice(from, to)`. */
export function toRange(v: ZoomView, count: number): [from: number, to: number] {
  const c = clampView(v, count);
  const n = clampNum(Math.round(c.size), minSize(count), count);
  const from = clampNum(Math.round(c.start), 0, count - n);
  return [from, from + n];
}

/**
 * Zoom level as a 0–1 slider position: 0 shows everything, 1 is zoomed in all the way.
 * It is logarithmic, so each step along the slider zooms by the same proportion.
 */
export function zoomLevel(v: ZoomView, count: number): number {
  const span = Math.log(count / minSize(count));
  return span > 0 ? clampNum(Math.log(count / clampView(v, count).size) / span, 0, 1) : 0;
}

/** Set the zoom level from a slider position (see `zoomLevel`), keeping the middle of the view in place. */
export function withZoomLevel(v: ZoomView, count: number, level: number): ZoomView {
  const size = count * (minSize(count) / count) ** clampNum(level, 0, 1);
  return zoomBy(v, count, size / clampView(v, count).size, 0.5);
}
