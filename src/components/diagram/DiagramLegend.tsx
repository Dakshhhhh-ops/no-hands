export interface DiagramLegendProps {
  projectVersion: number;
  /** Show the planned entry only when the project was imported from code. */
  hasCodeOrigin: boolean;
}

export default function DiagramLegend({ projectVersion, hasCodeOrigin }: DiagramLegendProps) {
  return (
    <div className="legend" id="diagram-legend">
      <span className="legend-item"><i className="legend-direct" /> Selected / Direct</span>
      <span className="legend-item"><i className="legend-downstream" /> Downstream impact</span>
      <span className="legend-item"><i className="legend-upstream" /> Upstream outage cascade</span>
      <span className="legend-item"><i className="legend-changed" /> Modified in v{projectVersion}</span>
      {hasCodeOrigin && (
        <span className="legend-item"><i className="legend-planned" /> Planned, not in code yet</span>
      )}
      <span className="legend-item legend-flow">→ Data flow</span>
    </div>
  );
}
