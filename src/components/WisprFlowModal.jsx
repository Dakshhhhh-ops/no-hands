import { useState } from 'react';
import { ArrowRight, CheckCircle2, Copy, ExternalLink, Keyboard, Mic, Radio, Sparkles, Volume2, X } from 'lucide-react';
import { sound } from '../utils/sound.js';

export default function WisprFlowModal({ isOpen, onClose, onSimulateVoice }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  function copyShortcut() {
    navigator.clipboard?.writeText?.('Wispr Flow: Focus input field & dictate directly');
    setCopied(true);
    sound.click();
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSimulate() {
    sound.apply();
    onSimulateVoice();
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="wispr-modal" role="dialog" aria-modal="true" aria-labelledby="wispr-modal-title">
        <div className="modal-header">
          <div className="wispr-header-lead">
            <span className="badge-architectural">[INPUT_TELEMETRY // WISPR_FLOW]</span>
            <h2 id="wispr-modal-title" className="wispr-title">
              <Radio size={20} className="text-cyan animate-pulse" />
              Voice-First Architecture Dictation
            </h2>
          </div>
          <button className="icon-button" onClick={() => { sound.click(); onClose(); }} aria-label="Close guide">
            <X size={18} />
          </button>
        </div>

        <p className="modal-summary">
          VoiceArchitect is built for hands-free engineering architecture. Dictate complex system modifications
          naturally using <strong>Wispr Flow</strong>, and watch the entire architecture graph, OpenAPI contract,
          risk analysis, and Jira tasks materialize deterministically in real time.
        </p>

        <div className="wispr-steps-grid">
          <div className="wispr-step-card">
            <div className="step-num-tag">[01 / FOCUS]</div>
            <div className="step-icon-wrap"><Keyboard size={18} /></div>
            <h4>Focus Input</h4>
            <p>Click inside the Architecture Command textarea or press <kbd>Tab</kbd> to focus.</p>
          </div>

          <div className="wispr-step-card">
            <div className="step-num-tag">[02 / DICTATE]</div>
            <div className="step-icon-wrap active-mic"><Mic size={18} /></div>
            <h4>Trigger Wispr</h4>
            <p>Hold your Wispr Flow shortcut (default <kbd>Fn</kbd> or <kbd>Ctrl+Space</kbd>) and speak freely.</p>
          </div>

          <div className="wispr-step-card">
            <div className="step-num-tag">[03 / SYNTHESIS]</div>
            <div className="step-icon-wrap"><Sparkles size={18} /></div>
            <h4>Instant Synthesis</h4>
            <p>VoiceArchitect parses the command, presents unresolved decisions, and binds every engineering artifact.</p>
          </div>
        </div>

        <div className="wispr-callout-box">
          <div className="callout-corner-mark top-left" />
          <div className="callout-corner-mark top-right" />
          <div className="callout-corner-mark bottom-left" />
          <div className="callout-corner-mark bottom-right" />
          <div className="callout-content">
            <div className="callout-header">
              <b>PRO-TIP: DETERMINISTIC PROVENANCE</b>
              <span className="text-cyan text-mono">NO HALLUCINATIONS</span>
            </div>
            <p>
              Unlike generative black boxes, VoiceArchitect isolates unspecified assumptions (like rate limit thresholds and Redis outage failovers)
              as <em>Open Decisions</em> so your production team maintains total control over architecture governance.
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button className="button subtle" onClick={copyShortcut}>
            {copied ? <CheckCircle2 size={14} className="text-cyan" /> : <Copy size={14} />}
            <span>{copied ? 'Copied Reference' : 'Copy Dictation Guide'}</span>
          </button>
          <button className="button primary" onClick={handleSimulate}>
            <Radio size={14} />
            <span>Simulate Voice Dictation</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

