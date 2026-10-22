import { useEffect, useRef } from 'react';

/** Open dialogs, innermost last: only the top one reacts to Escape and Tab. */
const stack: symbol[] = [];

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** True while any modal dialog is open, so global shortcuts can stay out of the way. */
export const isDialogOpen = () => stack.length > 0;

/**
 * Standard modal behavior: focus moves into the dialog when it opens, Tab stays
 * inside it, Escape closes it, and focus returns to where it was on close.
 * Attach the returned ref to the dialog element.
 */
export function useDialog<T extends HTMLElement = HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const id = Symbol('dialog');
    stack.push(id);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = ref.current;
    const focusables = () => (node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') || focusables()[0] || node;
    if (first && first === node && !node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
    first?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) return;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open]);

  return ref;
}
