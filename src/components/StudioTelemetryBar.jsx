import { useEffect, useState } from 'react';
import { Activity, Clock, Compass, Cpu, HelpCircle, Radio, Volume2, VolumeX, Wifi } from 'lucide-react';
import { sound } from '../utils/sound.js';

export default function StudioTelemetryBar({ project, onOpenWisprGuide }) {
  const [timeUtc, setTimeUtc] = useState('');
  const [timeCet, setTimeCet] = useState('');
  const [timeLocal, setTimeLocal] = useState('');
  const [soundOn, setSoundOn] = useState(sound.enabled);

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setTimeUtc(now.toUTCString().slice(17, 25) + ' UTC');
      try {
        const cetStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Paris',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(now);
        setTimeCet(`${cetStr} CET`);
      } catch {
        setTimeCet('CET');
      }
      setTimeLocal(now.toTimeString().slice(0, 8));
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  function toggleAudio() {
    const newState = sound.toggle();
    setSoundOn(newState);
  }

  const openDecisions = project?.requirements.filter((r) => r.text?.toLowerCase().includes('unresolved')).length || 2;

  return (
    <div className="studio-telemetry-bar" aria-label="Studio telemetry status bar">
      <div className="telemetry-group telemetry-left">
        <span className="telemetry-badge pulse-badge">
          <span className="telemetry-dot" />
          <span className="telemetry-text">[SYSTEM: OPERATIONAL]</span>
        </span>
        <span className="telemetry-item hide-on-mobile">
          <Cpu size={12} className="telemetry-icon text-cyan" />
          <span>DETERMINISTIC ENGINE · <b className="text-glow">60 FPS</b></span>
        </span>
        <span className="telemetry-item hide-on-tablet">
          <Compass size={12} className="telemetry-icon" />
          <span>SPEC // ISO-42010 ARCH</span>
        </span>
      </div>

      <div className="telemetry-group telemetry-center hide-on-mobile">
        <div className="telemetry-clock-group">
          <Clock size={11} className="telemetry-icon text-muted" />
          <span className="telemetry-time" title="Local Time">{timeLocal || '00:00:00'} LOC</span>
          <span className="telemetry-sep">/</span>
          <span className="telemetry-time" title="Central European Time">{timeCet || '00:00 CET'}</span>
          <span className="telemetry-sep">/</span>
          <span className="telemetry-time" title="Universal Coordinated Time">{timeUtc || '00:00 UTC'}</span>
        </div>
      </div>

      <div className="telemetry-group telemetry-right">
        <button
          type="button"
          className="telemetry-action-btn wispr-pill"
          onClick={onOpenWisprGuide}
          title="Wispr Flow Voice Dictation Guide"
        >
          <Radio size={12} className="text-cyan animate-pulse" />
          <span className="wispr-label">Wispr Flow Ready</span>
          <span className="wispr-hotkey-tag">Ctrl+Space</span>
        </button>

        <button
          type="button"
          className={`telemetry-action-btn audio-btn ${soundOn ? 'active' : ''}`}
          onClick={toggleAudio}
          title={soundOn ? 'Tactile Sound Effects: Enabled (Click to mute)' : 'Tactile Sound Effects: Muted (Click to enable)'}
          aria-label={soundOn ? 'Mute sound effects' : 'Enable sound effects'}
        >
          {soundOn ? <Volume2 size={13} className="text-cyan" /> : <VolumeX size={13} />}
          <span className="sound-text">{soundOn ? 'Audio FX' : 'Muted'}</span>
        </button>
      </div>
    </div>
  );
}

