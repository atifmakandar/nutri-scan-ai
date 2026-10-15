import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fieldworkError, fieldworkListPath, fieldworkLocalDay, fieldworkNextDayDelay, fieldworkPage,
} from './fieldwork.js';

export function useFieldworkAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(null);
  useEffect(() => () => { controller.current?.abort(); controller.current = null; }, []);
  async function run(work) {
    if (controller.current) return null;
    const current = new AbortController();
    controller.current = current;
    setBusy(true); setError('');
    try {
      const value = await work(current.signal);
      return current.signal.aborted || controller.current !== current ? null : value;
    } catch (failure) {
      if (!current.signal.aborted && failure?.name !== 'AbortError') setError(fieldworkError(failure));
      return null;
    } finally {
      if (controller.current === current) { controller.current = null; setBusy(false); }
    }
  }
  return { busy, error, setError, run };
}

export function useFieldworkPage(api, collection, farmId, online, filters = {}, refreshKey = 0) {
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(20);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ data: null, loading: Boolean(online), error: '' });
  const path = fieldworkListPath(collection, { ...filters, offset, limit });
  useEffect(() => {
    if (!online) { setState((current) => ({ ...current, loading: false })); return; }
    let active = true;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: '' }));
    Promise.resolve().then(() => api(path, { signal: controller.signal }))
      .then((value) => {
        const data = fieldworkPage(value, farmId);
        if (active) setState({ data, loading: false, error: '' });
      }).catch((error) => {
        if (active && error?.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: fieldworkError(error) }));
      });
    return () => { active = false; controller.abort(); };
  }, [api, path, farmId, online, revision, refreshKey]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  function replace(record) {
    setState((current) => ({ ...current, data: current.data ? {
      ...current.data, items: current.data.items.map((item) => item.id === record.id ? record : item),
    } : null }));
  }
  return { ...state, refresh, replace, setOffset, setLimit: (value) => { setLimit(value); setOffset(0); } };
}

export function useFieldworkDay() {
  const [today, setToday] = useState(fieldworkLocalDay);
  useEffect(() => {
    let timer;
    function update() {
      setToday(fieldworkLocalDay());
      clearTimeout(timer);
      timer = setTimeout(update, fieldworkNextDayDelay() + 50);
    }
    const visible = () => { if (document.visibilityState === 'visible') update(); };
    update();
    document.addEventListener('visibilitychange', visible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, []);
  return today;
}
