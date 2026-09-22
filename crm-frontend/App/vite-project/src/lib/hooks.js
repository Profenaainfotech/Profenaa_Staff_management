import { useCallback, useEffect, useRef, useState } from "react";
import { subscribe } from "./socket";

/** Load data with loading/error state.  const { data, error, loading, reload } = useAsync(() => api.get(...), [deps]) */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const reload = useCallback(async ({ silent = false } = {}) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, error: "", loading: false });
    } catch (e) {
      if (id === seq.current) setState((s) => ({ data: silent ? s.data : null, error: e.message, loading: false }));
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload };
}

/**
 * Keep a screen fresh: reload when the server pushes an attendance update / notification,
 * and poll as a safety net (sockets can drop on flaky office Wi-Fi).
 */
export function useLiveRefresh(role, reload, { events = ["attendance:update"], pollMs = 30000 } = {}) {
  const ref = useRef(reload);
  ref.current = reload;
  useEffect(() => {
    let t = null;
    const fire = () => {
      clearTimeout(t);
      t = setTimeout(() => ref.current({ silent: true }), 400); // burst-friendly
    };
    const offs = events.map((e) => subscribe(role, e, fire));
    const poll = pollMs ? setInterval(() => ref.current({ silent: true }), pollMs) : null;
    return () => {
      clearTimeout(t);
      offs.forEach((off) => off());
      if (poll) clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
}

/** Re-render every `ms` (for live countdowns) */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
