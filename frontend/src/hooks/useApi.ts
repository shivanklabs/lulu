import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (data: T) => void;
}

const toApiError = (err: unknown): ApiError =>
  err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Something went wrong. Please try again.');

// Loads data from the API and re-runs whenever `key` changes. Responses for an old key are ignored.
// Pass key = null to skip loading (e.g. until a required selection is made).
export const useApi = <T,>(loader: () => Promise<T>, key: string | null): ApiState<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(key !== null);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);

  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (key === null) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err: unknown) => {
        if (active) setError(toApiError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
};
