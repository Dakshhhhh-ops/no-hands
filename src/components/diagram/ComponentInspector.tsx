import { relationshipKey } from '../../data/diagram.ts';
import type { ImpactNode } from '../../data/graphTraversal.ts';
import { sound } from '../../utils/sound.ts';
import type { Component, Relationship } from '../../types/schema.ts';

export interface ComponentInspectorProps {
  selected: Component;
  /** Upstream callers (outage cascade). */
  upstream: Component[];
  /** Downstream dependencies. */
  downstream: Component[];
  /** Hop distance from the selected component, by component id. */
  depthMatrix: Map<string, ImpactNode> | undefined;
  connectedRelationships: Relationship[];
  byId: Map<string, Component>;
  setSelectedId: (id: string | null) => void;
}

export default function ComponentInspector({
  selected,
  upstream,
  downstream,
  depthMatrix,
  connectedRelationships,
  byId,
  setSelectedId,
}: ComponentInspectorProps) {
  return (
    <section className="component-inspector" aria-live="polite">
      <div className="component-inspector-heading">
        <div>
          <span className="eyebrow">{selected.type}</span>
          <h3>{selected.name}</h3>
        </div>
        <button
          type="button"
          className="button compact"
          onClick={() => {
            sound.click();
            setSelectedId(null);
          }}
        >
          Clear selection
        </button>
      </div>

      <div className="component-inspector-grid">
        {/* Responsibilities */}
        <div className="inspector-box">
          <div className="inspector-box-header">
            <b>Responsibilities & Bounds</b>
          </div>
          <ul>
            {(selected.responsibilities || [selected.sub]).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        {/* Upstream Blast Radius (Outage cascade) */}
        <div className="inspector-box">
          <div className="inspector-box-header">
            <b>Upstream Callers Affected ({upstream.length})</b>
          </div>
          {upstream.length ? (
            <ul>
              {upstream.map((item) => {
                const hop = depthMatrix?.get(item.id)?.distance;
                return (
                  <li key={item.id}>
                    <b>{item.name}</b> <small>({item.id})</small>
                    {hop && <span className="hop-tag upstream">{hop} hop{hop > 1 ? 's' : ''}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No upstream callers. Outage does not cascade to other internal services.</p>
          )}
        </div>

        {/* Downstream Dependencies */}
        <div className="inspector-box">
          <div className="inspector-box-header">
            <b>Downstream Dependencies ({downstream.length})</b>
          </div>
          {downstream.length ? (
            <ul>
              {downstream.map((item) => {
                const hop = depthMatrix?.get(item.id)?.distance;
                return (
                  <li key={item.id}>
                    <b>{item.name}</b> <small>({item.id})</small>
                    {hop && <span className="hop-tag downstream">{hop} hop{hop > 1 ? 's' : ''}</span>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No downstream dependencies modeled.</p>
          )}
        </div>

        {/* Direct Connections */}
        <div className="inspector-box">
          <div className="inspector-box-header">
            <b>Direct Connections ({connectedRelationships.length})</b>
          </div>
          {connectedRelationships.length ? (
            <ul>
              {connectedRelationships.map((relationship) => {
                const outgoing = relationship.from === selected.id;
                const otherId = outgoing ? relationship.to : relationship.from;
                return (
                  <li key={relationshipKey(relationship)}>
                    <span className="arrow-chip">{outgoing ? 'OUT →' : '← IN'}</span>{' '}
                    <b>{byId.get(otherId)?.name || otherId}</b>
                    <small className="rel-label"> · {relationship.label}</small>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>No direct relationships modeled.</p>
          )}
        </div>
      </div>
    </section>
  );
}
