const FILLERS = /\b(please|um+|uh+|erm+|basically|just|kind of|you know)\b/gi;

/** Normalize common Wispr transcription variants for deterministic matching.
 * Keep the original utterance elsewhere for traceability; this is only a match key.
 */
export function normalizeArchitectureCommand(input = '') {
  let normalized = String(input).toLowerCase();
  normalized = normalized
    .replace(/\bred\s+is\b/g, 'redis')
    .replace(/\bpost\s*gress(?:\s*sql)?\b/g, 'postgresql')
    .replace(/\bpostgre\s+sql\b/g, 'postgresql')
    .replace(/\bpostgressql\b/g, 'postgresql')
    .replace(/\brate[- ]limits?\b/g, 'rate limit')
    .replace(/\brate limiting\b/g, 'rate limit')
    .replace(/\b(event|message|kafka)\s+cue\b/g, '$1 queue')
    .replace(/\bcue\s+(?=in kafka|with kafka|for kafka|queue)/g, 'queue ')
    .replace(FILLERS, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const unresolvedTerms = [];
  if (/\bcue\b/.test(normalized)) {
    unresolvedTerms.push('“cue” is ambiguous; confirm whether you meant a message queue (for example, Kafka).');
  }
  return { normalized, unresolvedTerms };
}
