import { useSyncExternalStore } from 'react';

const supported = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/** Whether a CSS media query matches now, updating when it starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!supported()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener?.('change', onChange);
      return () => list.removeEventListener?.('change', onChange);
    },
    () => (supported() ? window.matchMedia(query).matches : false),
    () => false,
  );
}
