/** The diagram's static SVG definitions: gradients, filters, markers, and patterns referenced by id. */
export default function DiagramDefs() {
  return (
    <defs>
      {/* 3D Node Gradients */}
      <linearGradient id="node-gradient-base" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1e2430" />
        <stop offset="50%" stopColor="#1a1e26" />
        <stop offset="100%" stopColor="#13161c" />
      </linearGradient>
      <linearGradient id="node-gradient-selected" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#0e1a2a" />
        <stop offset="50%" stopColor="#0a1624" />
        <stop offset="100%" stopColor="#05101c" />
      </linearGradient>
      <linearGradient id="node-gradient-changed" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1a2a1e" />
        <stop offset="50%" stopColor="#142016" />
        <stop offset="100%" stopColor="#0e1810" />
      </linearGradient>
      <linearGradient id="node-gradient-down" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#2a1414" />
        <stop offset="50%" stopColor="#200e0e" />
        <stop offset="100%" stopColor="#180808" />
      </linearGradient>
      <linearGradient id="node-gradient-degraded" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#2a2414" />
        <stop offset="50%" stopColor="#20180e" />
        <stop offset="100%" stopColor="#181008" />
      </linearGradient>

      {/* 3D Edge Gradients */}
      <linearGradient id="edge-gradient-base" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#384456" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#4a5a6e" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#384456" stopOpacity="0.6" />
      </linearGradient>
      <linearGradient id="edge-gradient-direct" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="var(--va-accent)" stopOpacity="0.8" />
        <stop offset="50%" stopColor="var(--va-accent)" stopOpacity="1" />
        <stop offset="100%" stopColor="var(--va-accent)" stopOpacity="0.8" />
      </linearGradient>
      <linearGradient id="edge-gradient-downstream" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="var(--va-violet)" stopOpacity="0.8" />
        <stop offset="50%" stopColor="var(--va-violet)" stopOpacity="1" />
        <stop offset="100%" stopColor="var(--va-violet)" stopOpacity="0.8" />
      </linearGradient>
      <linearGradient id="edge-gradient-upstream" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="var(--va-amber)" stopOpacity="0.8" />
        <stop offset="50%" stopColor="var(--va-amber)" stopOpacity="1" />
        <stop offset="100%" stopColor="var(--va-amber)" stopOpacity="0.8" />
      </linearGradient>
      <linearGradient id="edge-gradient-changed" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="var(--va-accent)" stopOpacity="1" />
        <stop offset="50%" stopColor="var(--va-accent)" stopOpacity="1" />
        <stop offset="100%" stopColor="var(--va-accent)" stopOpacity="1" />
      </linearGradient>
      <linearGradient id="edge-gradient-severed" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="var(--va-rose)" stopOpacity="0.6" />
        <stop offset="50%" stopColor="var(--va-rose)" stopOpacity="0.8" />
        <stop offset="100%" stopColor="var(--va-rose)" stopOpacity="0.6" />
      </linearGradient>

      {/* Glow Filters */}
      <filter id="glow-subtle" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-strong" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-accent" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.3 0 0 0 0 0.95 0 0 0 0 0.82 0 0 0 1 0" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-danger" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feColorMatrix in="blur" type="matrix" values="0.93 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* 3D Depth Shadow */}
      <filter id="depth-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.3" />
      </filter>
      <filter id="depth-shadow-strong" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="#000" floodOpacity="0.4" />
      </filter>

      {/* Edge Markers */}
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
        <path d="M0,0 L0,6 L7,3 z" fill="#52647c" />
      </marker>
      <marker id="arrow-changed" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
        <path d="M0,0 L0,6 L7,3 z" fill="var(--va-accent)" />
      </marker>
      <marker id="arrow-direct" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
        <path d="M0,0 L0,6 L7,3 z" fill="var(--va-accent)" />
      </marker>
      <marker id="arrow-downstream" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
        <path d="M0,0 L0,6 L7,3 z" fill="var(--va-violet)" />
      </marker>
      <marker id="arrow-upstream" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
        <path d="M0,0 L0,6 L7,3 z" fill="var(--va-amber)" />
      </marker>

      {/* Particle Definitions */}
      <radialGradient id="particle-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--va-accent)" stopOpacity="1" />
        <stop offset="70%" stopColor="var(--va-accent)" stopOpacity="0.3" />
        <stop offset="100%" stopColor="var(--va-accent)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="particle-glow-downstream" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--va-violet)" stopOpacity="1" />
        <stop offset="70%" stopColor="var(--va-violet)" stopOpacity="0.3" />
        <stop offset="100%" stopColor="var(--va-violet)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="particle-glow-upstream" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--va-amber)" stopOpacity="1" />
        <stop offset="70%" stopColor="var(--va-amber)" stopOpacity="0.3" />
        <stop offset="100%" stopColor="var(--va-amber)" stopOpacity="0" />
      </radialGradient>

      {/* Node Type Icons as Patterns */}
      <pattern id="pattern-service" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="4" r="1.5" fill="var(--va-accent)" opacity="0.15" />
      </pattern>
      <pattern id="pattern-datastore" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect x="2" y="2" width="4" height="4" fill="var(--va-violet)" opacity="0.15" />
      </pattern>
      <pattern id="pattern-external" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M2,6 L6,2 M2,2 L6,6" stroke="var(--va-amber)" strokeWidth="1" opacity="0.15" />
      </pattern>

    </defs>
  );
}
