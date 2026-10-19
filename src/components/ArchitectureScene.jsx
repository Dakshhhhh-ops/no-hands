import { useState } from 'react';
import { Activity, Compass, Cpu, Database, Eye, Layers, Radio, Sparkles } from 'lucide-react';

export default function ArchitectureScene({ project }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  if (!project) {
    return (
      <div className="architecture-scene scene-empty" role="group" aria-label="Architecture model overview">
        <div className="scene-header">
          <span className="scene-tag">[SNAPSHOT // CAD_VIEW]</span>
          <span className="scene-status">NO MODEL LOADED</span>
        </div>
        <div className="scene-empty-message">
          <Layers size={24} className="text-muted" />
          <b>Waiting for model initialization</b>
          <span>Load the Commerce Platform sample to preview its 3D architectural projection.</span>
        </div>
      </div>
    );
  }

  const component = (id) => project.components.find((item) => item.id === id)?.name || id;
  const services = project.components.filter((item) => item.type === 'SERVICE').length;
  const stores = project.components.filter((item) => ['DATABASE', 'CACHE'].includes(item.type)).length;
  const queues = project.components.filter((item) => item.type === 'QUEUE').length;

  function handleMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -12;
    setTilt({ x, y });
  }

  function handleMouseLeave() {
    setTilt({ x: 0, y: 0 });
  }

  return (
    <div
      className="architecture-scene"
      role="group"
      aria-label={`${project.name} three-dimensional architecture overview`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="scene-crosshair scene-tl">+</div>
      <div className="scene-crosshair scene-tr">+</div>
      <div className="scene-crosshair scene-bl">+</div>
      <div className="scene-crosshair scene-br">+</div>

      <div className="scene-header">
        <div className="scene-title-group">
          <span className="scene-tag">[ISOMETRIC // SYSTEM_CORE]</span>
          <span className="scene-azimuth">AZIMUTH 45° · 3D STACK</span>
        </div>
        <span className="scene-live">
          <i className="pulse-dot" /> MODEL v{project.version}
        </span>
      </div>

      <div className="scene-viewport" aria-hidden="true">
        <div className="scene-halo halo-one" />
        <div className="scene-halo halo-two" />
        <div className="scene-grid-lines" />

        {/* 3D Stack Core */}
        <div
          className="scene-core"
          style={{
            transform: `translate(-50%, -50%) rotateX(${57 + tilt.y}deg) rotateZ(${-35 + tilt.x}deg) scale(0.86)`,
            transition: 'transform 0.15s ease-out',
          }}
        >
          <div className="scene-slab scene-slab-base" title="Infrastructure / Persistent Storage Tier" />
          <div className="scene-slab scene-slab-data" title="Cache & Messaging Tier" />
          <div className="scene-slab scene-slab-services" title="Application Services Tier" />
          <div className="scene-core-light" />
        </div>

        {/* Tactical Floating Entity Chips */}
        <div className="scene-chip scene-chip-gateway" title="Edge API Gateway">
          <span className="chip-dot" />
          <b className="chip-name">{component('gateway')}</b>
          <small className="chip-type">INGRESS</small>
        </div>

        <div className={`scene-chip scene-chip-auth ${project.changed ? 'highlighted' : ''}`} title="Authentication & Token Service">
          <span className="chip-dot" />
          <b className="chip-name">{component('auth')}</b>
          <small className="chip-type">AUTH_SVC</small>
        </div>

        <div className={`scene-chip scene-chip-redis ${project.changed ? 'highlighted' : ''}`} title="Redis In-Memory Session Cache">
          <span className="chip-dot" />
          <b className="chip-name">{component('redis')}</b>
          <small className="chip-type">{project.changed ? 'PRIMARY_SESSION' : 'CACHE'}</small>
        </div>

        <div className="scene-chip scene-chip-db" title="PostgreSQL Relational Source of Truth">
          <span className="chip-dot" />
          <b className="chip-name">{component('postgres')}</b>
          <small className="chip-type">ACID_STORE</small>
        </div>

        {/* Laser Connectors between chips */}
        <div className="scene-connector connector-a" />
        <div className="scene-connector connector-b" />
        <div className="scene-connector connector-c" />
      </div>

      <div className="scene-footer">
        <div className="scene-stat-item">
          <b>{project.components.length}</b> <span>entities</span>
        </div>
        <div className="scene-sep">/</div>
        <div className="scene-stat-item">
          <b>{services}</b> <span>services</span>
        </div>
        <div className="scene-sep">/</div>
        <div className="scene-stat-item">
          <b>{stores}</b> <span>data stores</span>
        </div>
        <div className="scene-sep">/</div>
        <div className="scene-stat-item">
          <b>{queues}</b> <span>event broker</span>
        </div>
      </div>
    </div>
  );
}
