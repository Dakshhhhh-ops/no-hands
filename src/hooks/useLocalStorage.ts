import { useState, useEffect, useCallback } from 'react';

function useLocalStorage<T>(key: string, initialValue: T): [T, (_value: T | ((_prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // A functional update starts from the latest value, so two updates in one event both count.
  const setValue = useCallback((value: T | ((_prev: T) => T)) => {
    setStoredValue((previous) => {
      const valueToStore = value instanceof Function ? value(previous) : value;
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.warn(`Error saving to localStorage key "${key}":`, error);
      }
      return valueToStore;
    });
  }, [key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch {
      // ignore parse errors
    }
  }, [key]);

  return [storedValue, setValue];
}

export default useLocalStorage;