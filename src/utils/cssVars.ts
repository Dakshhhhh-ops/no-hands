import type { CSSProperties } from 'react';

/** Inline styles that set CSS custom properties, such as `{ '--d': 2 }` for reveal delays. */
export type CSSVars = CSSProperties & Record<`--${string}`, number | string>;

/**
 * React's CSSProperties has no custom properties; this accepts them, typed, without a cast.
 * React applies them through `style.setProperty`, which the CSP allows.
 */
export const cssVars = (vars: CSSVars): CSSProperties => vars;
