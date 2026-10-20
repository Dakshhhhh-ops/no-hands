import { useEffect, useRef, useState } from 'react';

export function useChaosWorker(project, chaosInjections) {
  const [telemetry, setTelemetry] = useState(null);
  const workerRef = useRef(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const worker = new Worker('/chaos-worker.js', { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      if (type === 'RESULT') {
        setTelemetry(payload);
        pendingRef.current = false;
      } else if (type === 'ERROR') {
        console.error('Chaos worker error:', payload);
        pendingRef.current = false;
      }
    };

    worker.onerror = (err) => {
      console.error('Chaos worker error:', err);
      pendingRef.current = false;
    };

    return () => {
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    if (!project || !workerRef.current || pendingRef.current) return;

    pendingRef.current = true;
    workerRef.current.postMessage({ type: 'SET_PROJECT', payload: project });
    workerRef.current.postMessage({ type: 'SET_CHAOS_INJECTIONS', payload: chaosInjections });
    workerRef.current.postMessage({ type: 'SIMULATE' });
  }, [project, chaosInjections]);

  return telemetry;
}