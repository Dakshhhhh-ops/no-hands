import { Check, Sparkles, Terminal } from 'lucide-react';
import { DEMO_COMMAND } from '../data/commerce.js';
import { sound } from '../utils/sound.js';

export const PRESET_COMMANDS = [
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

export default function CommandPresets({ onSelectPreset, currentCommand }) {
  return (
    <div className="presets-container" aria-label="Architecture command presets">
      <div className="presets-header">
        <div className="presets-title">
          <Terminal size={12} className="text-cyan" />
          <span>QUICK START INSTRUCTIONS</span>
        </div>
        <span className="presets-hint">Click preset to load</span>
      </div>

      <div className="presets-grid">
        {PRESET_COMMANDS.map((preset) => {
          const isActive = currentCommand.trim() === preset.command.trim();
          return (
            <button
              key={preset.id}
              type="button"
              className={`preset-card ${isActive ? 'active' : ''}`}
              onClick={() => {
                sound.click();
                onSelectPreset(preset.command);
              }}
            >
              <div className="preset-top">
                <span className="preset-tag">{preset.tag}</span>
                <span className="preset-cat">{preset.category}</span>
              </div>
              <div className="preset-title-wrap">
                <span className="preset-name">{preset.title}</span>
                {isActive && <Check size={13} className="preset-check text-cyan" />}
              </div>
              <p className="preset-snippet">“{preset.command.slice(0, 95)}...”</p>
              <div className="preset-chips">
                {preset.highlights.map((h) => (
                  <span key={h} className="preset-chip">
                    {h}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

