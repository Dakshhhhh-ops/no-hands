import { useMemo } from 'react';
import type { Project } from '../types/schema.ts';
import { simulateChaosAndTelemetry } from '../data/chaosSimulator.ts';
import type { ChaosInjection, ChaosSimulationResult } from '../data/chaosSimulator.ts';

/**
 * Chaos and telemetry simulation for the diagram.
 *
 * This used to run in a Web Worker served from /public, but that worker imported
 * the simulator by a path that does not exist at runtime, so it never answered and
 * the diagram crashed on its first render. The simulation is a small graph walk, so
 * it now runs synchronously and is memoized on its inputs. The name is kept so
 * existing imports and test mocks keep working.
 */
export function useChaosWorker(
  project: Project | null | undefined,
  chaosInjections: ChaosInjection[],
): ChaosSimulationResult | null {
  return useMemo(
    () => (project ? simulateChaosAndTelemetry(project, chaosInjections) : null),
    [project, chaosInjections],
  );
}
