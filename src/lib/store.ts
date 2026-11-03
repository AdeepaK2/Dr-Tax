import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// A tiny "data changed" signal so every screen reloads after a sync or an edit.
let version = 0;
const listeners = new Set<() => void>();

export function notifyDataChanged() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDataVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** Runs an async loader and re-runs it whenever data changes or `deps` change. */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]): { data: T | undefined; reload: () => void } {
  const v = useDataVersion();
  const [data, setData] = useState<T>();
  const [tick, setTick] = useState(0);
  // Always call the latest loader without re-running on every render.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let alive = true;
    loadRef.current().then(
      (d) => {
        if (alive) setData(d);
      },
      (e) => console.warn('load failed', e),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, tick, ...deps]);

  return { data, reload: () => setTick((t) => t + 1) };
}
