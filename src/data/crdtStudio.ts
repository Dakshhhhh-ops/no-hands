import type { Component, Relationship, Project } from '../types/schema.ts';

export interface PeerArchitect {
  peerId: string;
  name: string;
  color: string;
  cursorX: number;
  cursorY: number;
  selectedComponentId?: string;
  activeTab: string;
  lastActiveTimestamp: number;
}

export interface CrdtClock {
  peerId: string;
  counter: number;
}

export interface LwwRegister<T> {
  value: T;
  clock: CrdtClock;
  timestamp: number;
}

/**
 * Observed-Remove Set (OR-Set) for dynamic Components and Relationships.
 * Allows multiple architects to add and remove architecture nodes concurrently
 * without merge conflicts or state corruption.
 */
export class OrSet<T extends { id: string }> {
  // Elements added with unique tag
  private additions = new Map<string, { item: T; tag: string; timestamp: number }>();
  // Elements tombstoned
  private tombstones = new Set<string>();

  add(item: T, peerId: string): string {
    const tag = `${item.id}:${peerId}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
    this.additions.set(tag, { item, tag, timestamp: Date.now() });
    return tag;
  }

  remove(id: string): void {
    for (const [tag, entry] of this.additions.entries()) {
      if (entry.item.id === id) {
        this.tombstones.add(tag);
      }
    }
  }

  values(): T[] {
    const active = new Map<string, T>();
    for (const [tag, entry] of this.additions.entries()) {
      if (!this.tombstones.has(tag)) {
        active.set(entry.item.id, entry.item);
      }
    }
    return Array.from(active.values());
  }

  merge(remote: OrSet<T>): void {
    // Union additions
    for (const [tag, entry] of remote.additions.entries()) {
      if (!this.additions.has(tag)) {
        this.additions.set(tag, entry);
      }
    }
    // Union tombstones
    for (const tomb of remote.tombstones) {
      this.tombstones.add(tomb);
    }
  }
}

/**
 * Multi-user Collaborative Room state synchronizer.
 */
export class CollaborativeStudioRoom {
  roomId: string;
  localPeerId: string;
  localPeerName: string;
  peers = new Map<string, PeerArchitect>();
  private clock: CrdtClock;

  constructor(roomId: string, localPeerId = 'local-architect', localPeerName = 'Lead Architect') {
    this.roomId = roomId;
    this.localPeerId = localPeerId;
    this.localPeerName = localPeerName;
    this.clock = { peerId: localPeerId, counter: 0 };

    // Register initial peer
    this.updateLocalPresence(100, 100, 'diagram');
  }

  updateLocalPresence(x: number, y: number, activeTab = 'diagram', selectedComponentId?: string): PeerArchitect {
    const peer: PeerArchitect = {
      peerId: this.localPeerId,
      name: this.localPeerName,
      color: '#4ef2d2',
      cursorX: x,
      cursorY: y,
      activeTab,
      selectedComponentId,
      lastActiveTimestamp: Date.now(),
    };
    this.peers.set(this.localPeerId, peer);
    return peer;
  }

  /**
   * Simulates remote peer architects joining the live collaborative session
   * (e.g. Cloud Architect, Security Engineer, SRE).
   */
  simulateRemotePeers(): PeerArchitect[] {
    const simulated: PeerArchitect[] = [
      {
        peerId: 'peer-sre-alice',
        name: 'Sarah (SRE Lead)',
        color: '#f59e0b',
        cursorX: 420,
        cursorY: 180,
        selectedComponentId: 'postgres',
        activeTab: 'diagram',
        lastActiveTimestamp: Date.now(),
      },
      {
        peerId: 'peer-sec-bob',
        name: 'Alex (Security Arch)',
        color: '#a78bfa',
        cursorX: 250,
        cursorY: 140,
        selectedComponentId: 'gateway',
        activeTab: 'openapi',
        lastActiveTimestamp: Date.now(),
      },
    ];

    for (const p of simulated) {
      this.peers.set(p.peerId, p);
    }
    return Array.from(this.peers.values());
  }

  getActivePeers(): PeerArchitect[] {
    return Array.from(this.peers.values());
  }
}

