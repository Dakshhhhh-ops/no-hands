import { Check } from 'lucide-react';
import { DEMO_COMMAND } from '../data/commerce.ts';
import { FOOD_DELIVERY_DEMO_COMMAND } from '../data/foodDelivery.ts';
import { sound } from '../utils/sound.ts';
import { suggestInstructions } from '../data/suggestions.ts';
import type { SuggestedInstruction } from '../data/suggestions.ts';
import type { Project } from '../types/schema.ts';

export interface CommandPresetsProps {
  onSelectPreset: (command: string) => void;
  currentCommand: string;
  sampleKind?: 'commerce' | 'food';
  project?: Project | null;
  isImported?: boolean;
}

const PRESET_COMMANDS: SuggestedInstruction[] = [
  {
    id: 'challenge-core',
    tag: 'DEMO',
    category: 'MIGRATION & RATE LIMIT',
    title: 'Redis Session Store & Auth Rate Limit',
    command: DEMO_COMMAND,
    highlights: ['Redis Session Store', 'PostgreSQL Truth', 'Login Rate Limit', 'Outage Resilience'],
  },
  {
    id: 'postgres-preserve',
    tag: 'DATA SAFETY',
    category: 'DATA INTEGRITY',
    title: 'Preserve PostgreSQL as Source of Truth',
    command: 'Keep PostgreSQL as the persistent source of truth for all user records and account state.',
    highlights: ['Zero data loss', 'Audit integrity', 'ACID compliance'],
  },
  {
    id: 'redis-resilience',
    tag: 'RESILIENCE',
    category: 'HIGH AVAILABILITY',
    title: 'Redis Outage Resilience & Fallback',
    command: 'Make login resilient if Redis becomes unavailable, and add rate limiting to the authentication endpoint.',
    highlights: ['Circuit breaker', 'Degraded mode', 'Failover safety'],
  },
  {
    id: 'rate-limiting',
    tag: 'SECURITY',
    category: 'TRAFFIC CONTROL',
    title: 'Authentication Endpoint Rate Limiting',
    command: 'Add rate limiting to the authentication endpoint to prevent brute-force attacks on login.',
    highlights: ['429 Header', 'Retry-After', 'Abuse prevention'],
  },
];

const FOOD_PRESETS: SuggestedInstruction[] = [{
  id: 'food-delivery-demo',
  tag: 'DEMO',
  category: 'ORDERS & DELIVERY',
  title: 'Food Delivery Data Ownership',
  command: FOOD_DELIVERY_DEMO_COMMAND,
  highlights: ['PostgreSQL Ownership', 'Checkout Rate Limit', 'Manual Decisions'],
}];

export default function CommandPresets({ onSelectPreset, currentCommand, sampleKind = 'commerce', project = null, isImported = false }: CommandPresetsProps) {
  // Imported systems get examples that name their own components; samples keep the
  // presets the offline rules understand.
  const suggested = isImported ? suggestInstructions(project) : [];
  const presets = suggested.length ? suggested : sampleKind === 'food' ? FOOD_PRESETS : PRESET_COMMANDS;
  return (
    <div className="presets-container" aria-label="Architecture command presets">

      <div className="presets-grid">
        {presets.map((preset) => {
          const isActive = currentCommand.trim() === preset.command.trim();
          return (
            <button
              key={preset.id}
              type="button"
              className={`preset-card ${isActive ? 'active' : ''}`}
              title={preset.command}
              onClick={() => {
                sound.click();
                onSelectPreset(preset.command);
              }}
            >
              <span className="preset-tag">{preset.tag.toLowerCase()}</span>
              <span className="preset-name">{preset.title}</span>
              {isActive && <Check size={13} className="preset-check" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

