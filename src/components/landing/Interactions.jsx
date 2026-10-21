import { Fragment } from 'react';

/**
 * Splits text into words that rise out of a mask, one after another, once an
 * ancestor marked [data-reveal] becomes visible. Screen readers get the plain text.
 */
export function SplitWords({ text, offset = 0, className = '' }) {
  const words = text.split(' ');
  return (
    <span className={`va-split ${className}`}>
      <span className="va-sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, i) => (
          <Fragment key={`${word}-${i}`}>
            <span className="va-split-mask">
              <span className="va-split-word" style={{ '--w': i + offset }}>{word}</span>
            </span>
            {i < words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}
