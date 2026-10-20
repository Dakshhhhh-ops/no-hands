import { useState, useCallback, useEffect } from 'react';

interface Toast {
  message: string;
  key: number;
}

export function useToast() {
  const [toast, setToastState] = useState<Toast | null>(null);

  const notify = useCallback((message: string) => {
    setToastState({ message, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToastState(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, notify };
}