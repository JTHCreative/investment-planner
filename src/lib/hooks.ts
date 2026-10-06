import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getUsername, MY_FOLDER, SHARED_FOLDER, watchFolders, watchPortfolio, watchPortfolios, watchSharedWithMe, type FolderState } from './db';
import { errorMessage, getHistories, getQuotes, marketVersion, subscribeMarket } from './market';
import { alignMonthlyReturns, type AlignedReturns } from './sim/series';
import type { Folder, Portfolio, PriceSeries, Quote } from './types';

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

/**
 * Everything this person can open: their own portfolios, then ones others shared with them. If the shared list
 * can't load, their own portfolios still show and `sharedError` says why.
 */
export function useAccessiblePortfolios(uid: string): Loadable<Portfolio[]> & { sharedError: string } {
  const own = usePortfolios(uid);
  const [shared, setShared] = useState<Loadable<Portfolio[]>>({ data: [], loading: true, error: '' });
  useEffect(
    () =>
      watchSharedWithMe(
        uid,
        (data) => setShared({ data, loading: false, error: '' }),
        (e) => setShared({ data: [], loading: false, error: e.message }),
      ),
    [uid],
  );
  const data = useMemo(() => [...own.data, ...shared.data.filter((p) => p.ownerId !== uid)], [own.data, shared.data, uid]);
  return { data, loading: own.loading || shared.loading, error: own.error, sharedError: shared.error };
}

const BUILT_IN_FOLDERS: Folder[] = [
  { id: MY_FOLDER, name: 'My Portfolios', color: 'orange', icon: 'briefcase', createdAt: 0 },
  { id: SHARED_FOLDER, name: 'Shared Portfolios', color: 'teal', icon: 'users', createdAt: 1 },
];

/** A portfolio's built-in home: shared ones (yours that you've shared, or other people's) go to Shared Portfolios. */
export const defaultFolder = (p: Portfolio, me: string) =>
  p.ownerId !== me || (p.memberIds?.length ?? 0) > 0 ? SHARED_FOLDER : MY_FOLDER;

/** The person's folders in bar order (the two built-in ones first), and where each portfolio is filed. */
export function useFolders(uid: string) {
  const [state, setState] = useState<FolderState & { loading: boolean; error: string }>({ folders: {}, folderOf: {}, loading: true, error: '' });
  useEffect(
    () =>
      watchFolders(
        uid,
        (s) => setState({ ...s, loading: false, error: '' }),
        (e) => setState({ folders: {}, folderOf: {}, loading: false, error: e.message }),
      ),
    [uid],
  );
  const folders = useMemo(() => {
    const builtIn = BUILT_IN_FOLDERS.map((f) => ({ ...f, ...state.folders[f.id], id: f.id }));
    const custom = Object.entries(state.folders)
      .filter(([id]) => id !== MY_FOLDER && id !== SHARED_FOLDER)
      .map(([id, f]) => ({ ...f, id }))
      .sort((a, b) => a.createdAt - b.createdAt);
    return [...builtIn, ...custom];
  }, [state.folders]);
  const folderFor = (p: Portfolio) => {
    const filed = state.folderOf[p.id];
    return filed && folders.some((f) => f.id === filed) ? filed : defaultFolder(p, uid);
  };
  return { folders, folderOf: state.folderOf, folderFor, loading: state.loading, error: state.error };
}

/** Someone's username, looked up once and cached. */
export function useUsername(uid: string | undefined): string | null | undefined {
  const [name, setName] = useState<{ uid?: string; name: string | null } | null>(null);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    getUsername(uid).then((n) => live && setName({ uid, name: n }));
    return () => {
      live = false;
    };
  }, [uid]);
  return name && name.uid === uid ? name.name : undefined;
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

/** Stable key so effects only re-run when the set of symbols (or the API keys) actually change. */
function useSymbolsKey(symbols: string[]): string {
  const v = useSyncExternalStore(subscribeMarket, marketVersion);
  const key = [...new Set(symbols)].sort().join(',');
  return key ? `${v}|${key}` : '';
}

const symbolsOf = (key: string) => key.split('|')[1].split(',');

export function useQuotes(symbols: string[], refreshMs = 60_000): Loadable<Record<string, Quote>> & { refresh: () => void } {
  const key = useSymbolsKey(symbols);
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Loadable<Record<string, Quote>>>({ data: {}, loading: false, error: '' });

  useEffect(() => {
    if (!key) {
      setState({ data: {}, loading: false, error: '' });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    getQuotes(symbolsOf(key))
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
  const key = useSymbolsKey(symbols);
  const [state, setState] = useState<Loadable<PriceSeries[]>>({ data: [], loading: false, error: '' });
  useEffect(() => {
    if (!key) {
      setState({ data: [], loading: false, error: '' });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    getHistories(symbolsOf(key))
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
