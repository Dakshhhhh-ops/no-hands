import { createElement, useSyncExternalStore } from 'react';
import type { AnchorHTMLAttributes, MouseEvent } from 'react';

/*
 * A tiny History API router: two routes ("/" and "/app") and their query parameters.
 * navigate() pushes a new entry; back and forward come in through popstate.
 */

const listeners = new Set<() => void>();
let lastWasPop = false;

function notify() {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    lastWasPop = true;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const currentHref = () => (typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search);

/** Goes to a path in this app; replace swaps the current history entry instead of adding one. */
export function navigate(to: string, { replace = false }: { replace?: boolean } = {}) {
  if (to === currentHref()) return;
  if (replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  lastWasPop = false;
  notify();
}

export interface Location {
  path: string;
  params: URLSearchParams;
  /** True when this location came from the back or forward button. */
  fromHistory: boolean;
}

/** The current path and query, re-rendering on navigate() and on back and forward. */
export function useLocation(): Location {
  const href = useSyncExternalStore(subscribe, currentHref, () => '/');
  const url = new URL(href, 'http://localhost');
  return { path: url.pathname.replace(/\/+$/, '') || '/', params: url.searchParams, fromHistory: lastWasPop };
}

export function usePath(): string {
  return useLocation().path;
}

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

/** An ordinary link that navigates in place on a plain left click; new-tab clicks behave as usual. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  return createElement('a', {
    ...rest,
    href: to,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (rest.target && rest.target !== '_self') return;
      event.preventDefault();
      navigate(to);
    },
  });
}
