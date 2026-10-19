import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, AudioLines, Check, ChevronDown, CircleHelp, ClipboardCheck, ClipboardList, Code2, FileArchive, FileCode2, LayoutDashboard, Mic2, Network, RotateCcw, ShieldAlert, Sparkles, X } from 'lucide-react';
import ArchitectureDiagram from './components/ArchitectureDiagram.jsx';
import OpenApiPanel from './components/OpenApiPanel.jsx';
import RiskPanel from './components/RiskPanel.jsx';
import TaskPanel from './components/TaskPanel.jsx';
import { applyChange, DEMO_COMMAND, makeCommerceProject, proposeChange } from './data/commerce.js';
import { createVerifiedExportZip } from './data/export.js';

const tabs = [
  { id: 'diagram', label: 'Architecture Diagram', icon: Network },
  { id: 'openapi', label: 'OpenAPI Contract', icon: FileCode2 },
  { id: 'risk', label: 'Risk & Consistency', icon: ShieldAlert },
  { id: 'tasks', label: 'Engineering Tasks', icon: ClipboardList },
];

export default function App() {
  const [project, setProject] = useState(null);
  const [command, setCommand] = useState('');
  const [tab, setTab] = useState('diagram');
  const [proposal, setProposal] = useState(null);
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const modalRef = useRef(null);
  const preview = useMemo(() => command.trim() ? proposeChange(command.trim()) : null, [command]);
  const activeTab = tabs.find((item) => item.id === tab);

  useEffect(() => {
    if (!proposal) return undefined;
    const previousFocus = document.activeElement;
    modalRef.current?.querySelector('button')?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape') { event.preventDefault(); setProposal(null); return; }
      if (event.key !== 'Tab') return;
      const buttons = [...(modalRef.current?.querySelectorAll('button:not(:disabled)') || [])];
      if (!buttons.length) return;
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus?.(); };
  }, [proposal]);

  function notify(message) {
    setToast(message);
    setToastKey((current) => current + 1);
  }
  function loadSample() {
    setProject(makeCommerceProject()); setCommand(''); setProposal(null); setTab('diagram'); notify('Commerce Platform demo loaded.');
  }
  function reset() {
    setProject(null); setCommand(''); setProposal(null); setTab('diagram'); notify('Demo reset.');
  }
  function showProposal() {
    if (!project) { notify('Load the Commerce Platform sample first.'); return; }
    if (!command.trim()) { notify('Enter or dictate a change first.'); return; }
    setProposal(proposeChange(command.trim()));
  }
  function confirmChange() {
    if (!project || !proposal) return;
    setProject((current) => applyChange(current, proposal)); setProposal(null); notify('Reviewed change applied to the project model.');
  }
  function exportAll() {
    if (!project) { notify('Load a project before exporting its artifacts.'); return; }
    try {
      const { data, files } = createVerifiedExportZip(project);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-v${project.version}.zip`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      notify(`Verified ZIP downloaded with ${files.length} current-model files.`);
    } catch (error) {
      notify(`Export failed: ${error instanceof Error ? error.message : 'Could not create the ZIP.'}`);
    }
  }
  function content() {
    if (!project) return <div className="empty-state"><div className="empty-mark"><Network size={24} /></div><b>Your architecture workspace is ready</b><p>Load the Commerce Platform sample to review a design and generate connected engineering artifacts.</p><button className="button primary" onClick={loadSample}>Load sample <ArrowRight size={15} /></button></div>;
    if (tab === 'diagram') return <ArchitectureDiagram project={project} />;
    if (tab === 'openapi') return <OpenApiPanel project={project} onNotify={notify} />;
    if (tab === 'risk') return <RiskPanel project={project} />;
    return <TaskPanel project={project} />;
  }

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#top" aria-label="VoiceArchitect home"><span className="brand-mark"><AudioLines size={22} /></span><span><b>VoiceArchitect</b><small>Architecture command workspace</small></span></a>
      <div className="top-actions"><span className="voice-badge"><i /> Wispr Flow Ready</span><button className="button" onClick={loadSample}><LayoutDashboard size={15} /> Load Sample Architecture</button><button className="button subtle" onClick={reset}><RotateCcw size={14} /> Reset Demo</button><button className="button primary export-button" onClick={exportAll}><FileArchive size={14} /> Export All</button></div>
    </header>

    <section className="intro" id="top"><div><span className="eyebrow">Voice to architecture</span><h1>Speak the change. See every consequence.</h1><p>Review architecture updates before they become your new source of truth.</p></div><div className="project-select"><span className="project-icon"><Code2 size={15} /></span><span><small>PROJECT</small><b>{project ? project.name : 'No project loaded'}</b></span><ChevronDown size={14} /></div></section>

    <section className="workspace">
      <aside className="command-card">
        <div className="section-head"><div><h2>Architecture command</h2><p>Describe a change in your own words</p></div><span className="section-index">01 / INPUT</span></div>
        <div className="command-body">
          <div className="dictation-hint"><span className="mic-icon"><Mic2 size={15} /></span><span><b>Mic ready</b><small>Click the text area, then use your Wispr Flow hotkey to dictate.</small></span><span className="ready-dot" /></div>
          <label htmlFor="architecture-command">Your instruction</label>
          <textarea id="architecture-command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Example: Move session storage to Redis, preserve PostgreSQL as the source of truth, add login rate limiting, and make login resilient if Redis is unavailable." />
          <div className="example-block"><div className="example-heading"><span>DEMO COMMAND</span><button onClick={() => { setCommand(DEMO_COMMAND); if (!project) setProject(makeCommerceProject()); notify('Sample project and demo instruction loaded.'); }}>Use example</button></div><p>“{DEMO_COMMAND}”</p></div>
          <div className="command-actions"><button className="button" onClick={() => { setCommand(''); setProposal(null); }}>Clear input</button><button className="button" disabled={!project || !command.trim()} onClick={showProposal}><ClipboardCheck size={14} /> Preview change</button><button className="button primary apply-button" disabled={!project || !preview} onClick={showProposal}>Review &amp; apply change <ArrowRight size={15} /></button></div>
          <div className="status-line"><span className={project ? 'status-dot active' : 'status-dot'} />{project ? `Commerce Platform · v${project.version} · ${project.requirements.length} requirements` : 'Waiting for a project. Load the Commerce Platform demo to begin.'}</div>
        </div>
      </aside>

      <section className="output-card">
        <div className="tabbar" role="tablist" aria-label="Architecture outputs" onKeyDown={(event) => {
          const current = tabs.findIndex((item) => item.id === tab);
          let next = current;
          if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
          else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = tabs.length - 1;
          else return;
          event.preventDefault(); setTab(tabs[next].id); document.getElementById(`tab-${tabs[next].id}`)?.focus();
        }}>{tabs.map(({ id, label, icon: Icon }) => <button id={`tab-${id}`} key={id} role="tab" aria-controls="artifact-panel" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon size={15} /><span>{label}</span></button>)}<span className="sync-state" role="presentation"><i />{project ? 'Synchronized' : 'Ready'}</span></div>
        <div className="output-heading"><div><span className="eyebrow">{activeTab.label}</span><h2>{project ? project.name : 'System architecture'}</h2></div>{project && <span className="version-chip">MODEL · v{project.version}</span>}</div>
        <div className="artifact-content" id="artifact-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>{content()}</div>
      </section>
    </section>

    <footer className="app-footer"><span><Sparkles size={13} /> Deterministic demo mode · Synthetic Commerce Platform data</span><span><CircleHelp size={13} /> Wispr Flow dictates into this field; no direct API integration.</span></footer>

    {proposal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setProposal(null); }}><section className="review-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="modal-header"><div><span className="eyebrow">REVIEW CHANGE</span><h2 id="review-title">Proposed architecture updates</h2></div><button className="icon-button" onClick={() => setProposal(null)} aria-label="Close review"><X size={18} /></button></div><p className="modal-summary">Review how VoiceArchitect interpreted your instruction. The project changes only after you apply it.</p><div className="proposal-list">{proposal.items.map((item) => <article className="proposal-item" key={item.key}><span className="proposal-check"><Check size={15} /></span><div><b>{item.title}</b><p>{item.detail}</p></div></article>)}</div><div className="assumption-box"><b>Open decisions — not assumed</b>{proposal.assumptions.map((item) => <span key={item}>· {item}</span>)}</div><div className="modal-actions"><button className="button" onClick={() => setProposal(null)}>Keep editing</button><button className="button primary" onClick={confirmChange}>Apply reviewed change <ArrowRight size={15} /></button></div></section></div>}
    {toast && <div className="toast" key={toastKey}><Activity size={14} />{toast}</div>}
  </main>;
}
