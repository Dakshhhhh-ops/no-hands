import { useState } from 'react';
import { ArrowRight, CheckCircle2, Copy, Keyboard, Mic, Radio, Sparkles, X } from 'lucide-react';
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
            <span className="badge-architectural">VOICE INPUT GUIDE</span>
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
          VoiceArchitect does not connect directly to Wispr Flow. Focus the instruction field and dictate with your Wispr
          shortcut; the transcript appears as regular text. You can also use browser speech recognition from the mic button.
        </p>

        <div className="wispr-steps-grid">
          <div className="wispr-step-card">
            <div className="step-num-tag">01 / INPUT</div>
            <div className="step-icon-wrap"><Keyboard size={18} /></div>
            <h4>Focus Input</h4>
            <p>Click inside the Architecture Command textarea or press <kbd>Tab</kbd> to focus.</p>
          </div>

          <div className="wispr-step-card">
            <div className="step-num-tag">02 / DICTATE</div>
            <div className="step-icon-wrap active-mic"><Mic size={18} /></div>
            <h4>Trigger Wispr</h4>
            <p>With the field focused, hold your configured Wispr Flow shortcut and speak.</p>
          </div>

          <div className="wispr-step-card">
            <div className="step-num-tag">03 / REVIEW</div>
            <div className="step-icon-wrap"><Sparkles size={18} /></div>
            <h4>Preview, then apply</h4>
            <p>Choose Preview to inspect proposed changes and open decisions. Nothing is applied until you confirm.</p>
          </div>
        </div>

        <div className="wispr-callout-box">
          <div className="callout-corner-mark top-left" />
          <div className="callout-corner-mark top-right" />
          <div className="callout-corner-mark bottom-left" />
          <div className="callout-corner-mark bottom-right" />
          <div className="callout-content">
            <div className="callout-header">
              <b>KEEP ARCHITECTURE DECISIONS EXPLICIT</b>
              <span className="text-cyan text-mono">REVIEW BEFORE APPLY</span>
            </div>
            <p>
              Unspecified choices, such as the rate-limit threshold and Redis outage behavior, stay marked as open decisions in the review.
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button className="button subtle" onClick={copyShortcut}>
            {copied ? <CheckCircle2 size={14} className="text-cyan" /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy dictation instructions'}</span>
          </button>
          <button className="button primary" onClick={handleSimulate}>
            <Radio size={14} />
            <span>Play sample dictation</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

