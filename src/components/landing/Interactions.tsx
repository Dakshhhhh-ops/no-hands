import { Fragment } from 'react';
import { cssVars } from '../../utils/cssVars.ts';

export interface SplitWordsProps {
  text: string;
  /** Index the word stagger starts from, to continue a previous line. */
  offset?: number;
  className?: string;
}

/**
 * Splits text into words that rise out of a mask, one after another, once an
 * ancestor marked [data-reveal] becomes visible. Screen readers get the plain text.
 */
export function SplitWords({ text, offset = 0, className = '' }: SplitWordsProps) {
  const words = text.split(' ');
  return (
    <span className={`va-split ${className}`}>
      <span className="va-sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <Fragment key={`${word}-${i}`}>
            <span className="va-split-mask">
              <span className="va-split-word" style={cssVars({ '--w': i + offset })}>{word}</span>
            </span>
            {i < words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}
