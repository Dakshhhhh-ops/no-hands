/**
 * Chaos Simulator Web Worker
 * Offloads simulation calculations from main thread to keep UI at 60fps
 */

import { simulateChaosAndTelemetry } from './chaosSimulator.ts';

let currentProject = null;
let chaosInjections = [];

self.onmessage = function(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'SET_PROJECT':
      currentProject = payload;
      break;

    case 'SET_CHAOS_INJECTIONS':
      chaosInjections = payload;
      break;

    case 'SIMULATE':
      if (!currentProject) {
        self.postMessage({ type: 'ERROR', payload: 'Project not set' });
        return;
      }
      try {
        const result = simulateChaosAndTelemetry(currentProject, chaosInjections);
        self.postMessage({ type: 'RESULT', payload: result });
      } catch (err) {
        self.postMessage({ type: 'ERROR', payload: err.message });
      }
      break;

    case 'RESET':
      currentProject = null;
      chaosInjections = [];
      break;

    default:
      self.postMessage({ type: 'ERROR', payload: `Unknown message type: ${type}` });
  }
};