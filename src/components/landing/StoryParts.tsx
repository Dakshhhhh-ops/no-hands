/*
 * Pieces of the small product illustrations, shared by the hero card and the
 * "How it works" steps. Decorative markup: callers hide them from assistive tech.
 */

export interface StoryDiffLine {
  kind: 'add' | 'ask';
  text: string;
}

export function DictationChip() {
  return <span className="va-story-chip tone-indigo">Dictated with Wispr Flow</span>;
}

export interface StoryDiffProps {
  lines: StoryDiffLine[];
  /** How many lines are shown; the rest keep their space but are hidden. */
  shown?: number;
}

export function StoryDiff({ lines, shown = lines.length }: StoryDiffProps) {
  return (
    <ul className="va-story-diff">
      {lines.map((line, i) => (
        <li key={line.text} className={`is-${line.kind}`} data-hidden={i >= shown ? 'true' : undefined}>
          {line.text}
        </li>
      ))}
    </ul>
  );
}

export interface StoryActionsProps {
  /** Whether "apply" is highlighted as the chosen action. */
  applied?: boolean;
}

export function StoryActions({ applied = true }: StoryActionsProps) {
  return (
    <div className="va-story-actions">
      <span>Keep editing</span>
      <span className={applied ? 'is-primary' : undefined}>&ldquo;apply&rdquo;</span>
    </div>
  );
}
