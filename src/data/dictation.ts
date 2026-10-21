/**
 * Readable cleanup for dictated instructions. Wispr Flow already removes fillers
 * and self-corrections (Backtrack); this pass fixes what dictation of any kind
 * tends to get wrong in architecture talk: product names and their casing.
 * The result is shown in the instruction box and sent to the interpreter, so it
 * stays close to what the person said.
 */

/** [pattern, replacement] in order; earlier, more specific patterns win. */
const TERMS: Array<[RegExp, string]> = [
  [/\bred\s+is\b(?=\s+(?:cache|cluster|instance|server|ke|ko|se|for|as|in|and|database|db)\b)/gi, 'Redis'],
  [/\bredis\b/gi, 'Redis'],
  [/\bpost\s*gres+(?:\s*(?:sql|q\s*l))?\b/gi, 'PostgreSQL'],
  [/\bpostgre\s*sql\b/gi, 'PostgreSQL'],
  [/\bpostgres(?:ql)?\b/gi, 'PostgreSQL'],
  [/\bmongo\s*db\b/gi, 'MongoDB'],
  [/\bmy\s*sql\b/gi, 'MySQL'],
  [/\bkafka\b/gi, 'Kafka'],
  [/\brabbit\s*m\s*q\b/gi, 'RabbitMQ'],
  [/\belastic\s*search\b/gi, 'Elasticsearch'],
  [/\b(?:engine\s*x|nginx)\b/gi, 'NGINX'],
  [/\bgraph\s*q\s*l\b/gi, 'GraphQL'],
  [/\bg\s*rpc\b/gi, 'gRPC'],
  [/\bk\s*8\s*s\b/gi, 'Kubernetes'],
  [/\bdocker[\s-]*compose\b/gi, 'docker-compose'],
  [/\bapi\s+gateway\b/gi, 'API Gateway'],
  [/\bapi\b/gi, 'API'],
  [/\bjwt\b/gi, 'JWT'],
];

/** Hesitations only. Real words such as "like" or "just" are left alone. */
const FILLERS = /(^|\s)(?:um+|uh+|erm+|hmm+|ah+)(?=[\s,.!?]|$)[,]?/gi;
const LEADING = /^(?:so|okay|ok|alright|right)[,\s]+(?=\S)/i;

export function cleanDictation(input: string): string {
  let text = String(input ?? '');
  text = text.replace(FILLERS, '$1');
  for (const [pattern, replacement] of TERMS) text = text.replace(pattern, replacement);
  text = text
    .replace(/\s+([,.!?;:])/g, '$1')        // no space before punctuation
    .replace(/([.!?,;:])\1+/g, '$1')         // "..", ",," → one
    .replace(/([,;:])(?=\S)/g, '$1 ')        // one space after
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .replace(LEADING, '')
    .replace(/[\s,;:]+$/, '');               // dangling trailing punctuation
  return text;
}

/**
 * Words worth adding to a Wispr Flow dictionary for this model: component names
 * and the technologies named in their descriptions, one per line, de-duplicated.
 */
export function dictionaryWords(project: { components: Array<{ name: string; sub?: string }> } | null): string[] {
  if (!project) return [];
  const words = new Set<string>();
  for (const component of project.components) {
    words.add(component.name.trim());
    const tech = cleanDictation(component.sub || '').match(/\b(?:Redis|PostgreSQL|MongoDB|MySQL|Kafka|RabbitMQ|Elasticsearch|NGINX|GraphQL|gRPC|Kubernetes)\b/g);
    tech?.forEach((t) => words.add(t));
  }
  return [...words].filter(Boolean);
}
