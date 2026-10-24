import { useEffect, useRef, useState } from 'react';

/**
 * Tracks keys that appeared since the previous render so a row can flash once.
 * The first batch (initial subscription) does not flash. Each batch clears on
 * its own timer so a fast tick cannot leave a row stuck highlighted.
 */
export function useFlash(keys: readonly string[], ms = 1600): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const mounted = useRef(true);
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(keys);
      return;
    }
    const fresh: string[] = [];
    for (const k of keys) {
      if (!seen.current.has(k)) {
        seen.current.add(k);
        fresh.push(k);
      }
    }
    if (fresh.length === 0) return;
    setFlashing(prev => {
      const next = new Set(prev);
      for (const k of fresh) next.add(k);
      return next;
    });
    window.setTimeout(() => {
      if (!mounted.current) return;
      setFlashing(prev => {
        const next = new Set(prev);
        for (const k of fresh) next.delete(k);
        return next;
      });
    }, ms);
  }, [keys, ms]);

  return flashing;
}
