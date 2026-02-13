import { useEffect, useMemo, useRef, useState } from 'react';

import {
  buildMarkerVisualKey,
  getMarkerIconDescriptor,
  MARKER_GENERATION_CONCURRENCY,
  normalizeMarkerLabel,
  type MarkerIconDescriptor,
  type MarkerStatus,
  type MarkerVisualKey,
} from './marker-icon-cache';

export type MarkerVisualInput = {
  label: string;
  status: MarkerStatus;
};

type MarkerRegistryStats = {
  generated: number;
  cacheHits: number;
  cacheMisses: number;
  generationSamplesMs: number[];
};

type MarkerIconRegistryOptions = {
  debug?: boolean;
  concurrency?: number;
};

type MarkerIconRegistryResult = {
  descriptors: Record<MarkerVisualKey, MarkerIconDescriptor>;
  isPrewarming: boolean;
  getDescriptor: (label: string, status: MarkerStatus) => MarkerIconDescriptor | null;
};

function createVisualKey(label: string, status: MarkerStatus): MarkerVisualKey {
  return buildMarkerVisualKey(label, status);
}

export function useMarkerIconRegistry(
  visuals: MarkerVisualInput[],
  options: MarkerIconRegistryOptions = {}
): MarkerIconRegistryResult {
  const [descriptors, setDescriptors] = useState<Record<MarkerVisualKey, MarkerIconDescriptor>>({});
  const descriptorsRef = useRef<Record<MarkerVisualKey, MarkerIconDescriptor>>({});
  const [isPrewarming, setIsPrewarming] = useState(false);
  const statsRef = useRef<MarkerRegistryStats>({
    generated: 0,
    cacheHits: 0,
    cacheMisses: 0,
    generationSamplesMs: [],
  });

  const debug = Boolean(options.debug);
  const concurrency = Math.max(1, options.concurrency ?? MARKER_GENERATION_CONCURRENCY);

  const uniqueVisuals = useMemo(() => {
    const dedup = new Map<MarkerVisualKey, { label: string; status: MarkerStatus }>();
    for (const visual of visuals) {
      const key = createVisualKey(visual.label, visual.status);
      if (!dedup.has(key)) {
        dedup.set(key, { label: normalizeMarkerLabel(visual.label), status: visual.status });
      }
    }
    return Array.from(dedup.entries()).map(([key, value]) => ({ key, ...value }));
  }, [visuals]);

  useEffect(() => {
    descriptorsRef.current = descriptors;
  }, [descriptors]);

  useEffect(() => {
    if (uniqueVisuals.length === 0) {
      setDescriptors({});
      setIsPrewarming(false);
      return;
    }

    let cancelled = false;
    setIsPrewarming(true);

    const pending = uniqueVisuals.filter((visual) => !descriptorsRef.current[visual.key]);
    if (pending.length === 0) {
      setIsPrewarming(false);
      return;
    }

    const queue = [...pending];
    const workerCount = Math.min(concurrency, queue.length);

    const runWorker = async () => {
      while (!cancelled) {
        const next = queue.shift();
        if (!next) {
          return;
        }

        const startedAt = Date.now();
        try {
          const result = await getMarkerIconDescriptor({ label: next.label, status: next.status });
          const elapsed = Date.now() - startedAt;
          const stats = statsRef.current;
          if (result.source === 'generated') {
            stats.generated += 1;
            stats.cacheMisses += 1;
            stats.generationSamplesMs.push(elapsed);
          } else {
            stats.cacheHits += 1;
          }

          if (!cancelled) {
            setDescriptors((prev) => {
              if (prev[next.key]) {
                return prev;
              }
              const nextState = { ...prev, [next.key]: result.descriptor };
              descriptorsRef.current = nextState;
              return nextState;
            });
          }
        } catch (error) {
          if (debug) {
            console.warn('Failed to prewarm marker icon', next, error);
          }
        }
      }
    };

    const job = Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    job.finally(() => {
      if (cancelled) {
        return;
      }
      setIsPrewarming(false);
      if (debug) {
        const stats = statsRef.current;
        const samples = [...stats.generationSamplesMs].sort((a, b) => a - b);
        const p95Index = samples.length === 0 ? -1 : Math.floor(samples.length * 0.95) - 1;
        const p95 = p95Index >= 0 ? samples[Math.max(0, p95Index)] : 0;
        const total = stats.cacheHits + stats.cacheMisses;
        const hitRatio = total > 0 ? stats.cacheHits / total : 1;
        console.log('[MapPins] marker_icons_generated_total', stats.generated);
        console.log('[MapPins] marker_icon_cache_hit_ratio', Number(hitRatio.toFixed(3)));
        console.log('[MapPins] marker_generation_ms_p95', p95);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [concurrency, debug, uniqueVisuals]);

  return {
    descriptors,
    isPrewarming,
    getDescriptor: (label: string, status: MarkerStatus) => {
      const key = createVisualKey(label, status);
      return descriptors[key] ?? null;
    },
  };
}
