/**
 * Follow-ups said or typed while a change is under review. Deterministic: a short
 * phrase is a command, anything else revises the pending change. English and
 * common Hinglish phrasings are both understood. Nothing here applies a change
 * by itself; the caller acts only on an explicit "apply".
 */
export type FollowUp =
  | { type: 'apply' }
  | { type: 'cancel' }
  | { type: 'undo' }
  | { type: 'revise'; text: string }
  | { type: 'empty' };

const key = (text: string) =>
  text.toLowerCase().replace(/[.!?,;:"'“”]/g, ' ').replace(/\s+/g, ' ').trim();

const POLITE = String.raw`(?:please|now|it|this|that|the change|this change|karo|kar do|kardo|kijiye|na|plz|pls)`;

const APPLY = new RegExp(
  String.raw`^(?:(?:ok(?:ay)?|yes|yeah|yep|haan|han|ha|theek hai|thik hai|sahi hai|looks good|lgtm|perfect|great|good)\s*)?(?:(?:then|so)\s+)?(?:apply|confirm|ship it|go ahead|do it|lagu|apply)(?:\s+${POLITE})*$`,
);
const CANCEL = new RegExp(
  String.raw`^(?:cancel|discard|never ?mind|forget it|rehne do|rahne do|chhodo|chodo|chhod do|mat karo|stop|close)(?:\s+${POLITE})*$`,
);
const UNDO = new RegExp(
  String.raw`^(?:undo|revert|go back|wapas|vapas|pichla hatao|pichhla hatao)(?:\s+(?:that|it|this|the last change|last change|the last one|karo|kar do|lo|le lo|please))*$`,
);

export function parseFollowUp(input: string): FollowUp {
  const text = key(String(input ?? ''));
  if (!text) return { type: 'empty' };
  if (APPLY.test(text)) return { type: 'apply' };
  if (CANCEL.test(text)) return { type: 'cancel' };
  if (UNDO.test(text)) return { type: 'undo' };
  return { type: 'revise', text: String(input).trim() };
}

/** The pending instruction plus a follow-up, so the interpreter sees the whole request. */
export function combineInstruction(base: string, followUp: string): string {
  const head = base.trim().replace(/[\s.;,]+$/, '');
  const tail = followUp.trim().replace(/^[\s.;,]+/, '');
  return `${head}. ${tail.charAt(0).toUpperCase()}${tail.slice(1)}`;
}
