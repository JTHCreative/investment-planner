import { useEffect, useMemo, useState } from 'react';
import { watchPortfolio, watchPortfolios } from './db';
import { errorMessage, getHistories, getQuotes } from './market';
import { alignMonthlyReturns, type AlignedReturns } from './sim/series';
import type { Portfolio, PriceSeries, Quote } from './types';

export interface Loadable<T> {
  data: T;
  loading: boolean;
  error: string;
}

export function usePortfolios(uid: string): Loadable<Portfolio[]> {
  const [state, setState] = useState<Loadable<Portfolio[]>>({ data: [], loading: true, error: '' });
  useEffect(
    () =>
      watchPortfolios(
        uid,
        (data) => setState({ data, loading: false, error: '' }),
        (e) => setState({ data: [], loading: false, error: e.message }),
      ),
    [uid],
  );
  return state;
}

export function usePortfolio(uid: string, pid: string): Loadable<Portfolio | null> {
  const [state, setState] = useState<Loadable<Portfolio | null>>({ data: null, loading: true, error: '' });
  useEffect(
    () =>
      watchPortfolio(
        uid,
        pid,
        (data) => setState({ data, loading: false, error: '' }),
        (e) => setState({ data: null, loading: false, error: e.message }),
      ),
    [uid, pid],
  );
  return state;
}

/** Stable key so effects only re-run when the set of symbols actually changes. */
function symbolsKey(symbols: string[]): string {
  return [...new Set(symbols)].sort().join(',');
}

export function useQuotes(symbols: string[], refreshMs = 60_000): Loadable<Record<string, Quote>> & { refresh: () => void } {
  const key = symbolsKey(symbols);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Loadable<Record<string, Quote>>>({ data: {}, loading: false, error: '' });

  useEffect(() => {
    if (!key) {
      setState({ data: {}, loading: false, error: '' });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    getQuotes(key.split(','))
      .then((data) => !cancelled && setState({ data, loading: false, error: '' }))
      .catch((e) => !cancelled && setState((s) => ({ ...s, loading: false, error: errorMessage(e) })));
    const timer = refreshMs ? setTimeout(() => setTick((t) => t + 1), refreshMs) : undefined;
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, tick, refreshMs]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}

export function useHistories(symbols: string[]): Loadable<PriceSeries[]> {
  const key = symbolsKey(symbols);
  const [state, setState] = useState<Loadable<PriceSeries[]>>({ data: [], loading: false, error: '' });
  useEffect(() => {
    if (!key) {
      setState({ data: [], loading: false, error: '' });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    getHistories(key.split(','))
      .then((data) => !cancelled && setState({ data, loading: false, error: '' }))
      .catch((e) => !cancelled && setState({ data: [], loading: false, error: errorMessage(e) }));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}

/** Monthly returns for `symbols`, in the same order as given, over their shared history. */
export function useAlignedReturns(symbols: string[]): Loadable<AlignedReturns | null> {
  const histories = useHistories(symbols);
  const order = symbols.join(',');
  const data = useMemo(() => {
    if (!histories.data.length) return null;
    const bySymbol = new Map(histories.data.map((h) => [h.symbol, h]));
    const ordered = order.split(',').map((s) => bySymbol.get(s)).filter((h): h is PriceSeries => !!h);
    if (ordered.length !== order.split(',').length) return null;
    return alignMonthlyReturns(ordered);
  }, [histories.data, order]);
  return { data, loading: histories.loading, error: histories.error };
}
