import type { IndexedDataset, KnowledgeDataset } from '../types/knowledge';
import { computeCelestialLayout, indexDataset, type CelestialLayout } from './dataset';

export const DEFAULT_MIND_DATASET_URL =
  '/assets/aistudio/knowledge_extraction_v3_2556cc71.json';

interface CachedMindEntry {
  raw: KnowledgeDataset;
  indexed: IndexedDataset;
  layout: CelestialLayout;
}

const cacheByUrl = new Map<string, CachedMindEntry>();
const inflightByUrl = new Map<string, Promise<CachedMindEntry | null>>();

export function getCachedMindBundle(
  url = DEFAULT_MIND_DATASET_URL,
  initialData?: KnowledgeDataset
): CachedMindEntry | null {
  if (initialData) {
    const existing = cacheByUrl.get(url);
    if (existing && existing.raw === initialData) {
      return existing;
    }
    const indexed = indexDataset(initialData);
    const layout = computeCelestialLayout(indexed);
    const entry = { raw: initialData, indexed, layout };
    cacheByUrl.set(url, entry);
    return entry;
  }
  return cacheByUrl.get(url) ?? null;
}

export async function loadMindBundle(
  url = DEFAULT_MIND_DATASET_URL
): Promise<CachedMindEntry | null> {
  const cached = cacheByUrl.get(url);
  if (cached) return cached;

  const inflight = inflightByUrl.get(url);
  if (inflight) return inflight;

  if (typeof fetch !== 'function') return null;

  const promise = (async (): Promise<CachedMindEntry | null> => {
    try {
      const pending = fetch(url);
      if (!pending || typeof pending.then !== 'function') return null;
      const response = await pending;
      if (!response || !response.ok) {
        throw new Error(`Failed to fetch archive (${response?.status ?? 'unknown'})`);
      }
      const raw = (await response.json()) as KnowledgeDataset;
      if (!raw || !Array.isArray(raw.nodes)) return null;
      const indexed = indexDataset(raw);
      const layout = computeCelestialLayout(indexed);
      const entry = { raw, indexed, layout };
      cacheByUrl.set(url, entry);
      return entry;
    } finally {
      inflightByUrl.delete(url);
    }
  })();

  inflightByUrl.set(url, promise);
  return promise;
}
