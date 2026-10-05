import { describe, expect, it } from 'vitest';
import { MIN_POINTS, fullView, isFull, panBy, toRange, withZoomLevel, zoomBy, zoomLevel } from './zoom';

describe('chart zoom', () => {
  it('starts out showing every point', () => {
    expect(toRange(fullView(100), 100)).toEqual([0, 100]);
    expect(isFull(fullView(100), 100)).toBe(true);
    expect(zoomLevel(fullView(100), 100)).toBe(0);
  });

  it('zooms in around the anchor and keeps the anchored point in place', () => {
    const v = zoomBy(fullView(100), 100, 0.5, 0.25);
    expect(v.size).toBe(50);
    // The point a quarter of the way across (25) stays a quarter of the way across.
    expect(v.start + 0.25 * v.size).toBe(25);
    expect(toRange(v, 100)).toEqual([13, 63]);
  });

  it('never zooms in past the minimum or out past everything', () => {
    expect(zoomBy(fullView(100), 100, 0.0001).size).toBe(MIN_POINTS);
    expect(zoomBy(fullView(100), 100, 10)).toEqual(fullView(100));
  });

  it('pans within the data and stops at either end', () => {
    const v = zoomBy(fullView(100), 100, 0.2, 0);
    expect(toRange(panBy(v, 100, 30), 100)).toEqual([30, 50]);
    expect(toRange(panBy(v, 100, 1000), 100)).toEqual([80, 100]);
    expect(toRange(panBy(v, 100, -1000), 100)).toEqual([0, 20]);
  });

  it('adds up small fractional moves instead of losing them', () => {
    let v = zoomBy(fullView(100), 100, 0.2, 0);
    for (let i = 0; i < 10; i++) v = panBy(v, 100, 0.3);
    expect(toRange(v, 100)[0]).toBe(3);
  });

  it('round-trips the slider position', () => {
    const v = withZoomLevel(fullView(240), 240, 0.6);
    expect(zoomLevel(v, 240)).toBeCloseTo(0.6);
    expect(isFull(withZoomLevel(v, 240, 0), 240)).toBe(true);
    expect(toRange(withZoomLevel(v, 240, 0), 240)).toEqual([0, 240]);
    expect(withZoomLevel(v, 240, 1).size).toBeCloseTo(MIN_POINTS);
  });
});
