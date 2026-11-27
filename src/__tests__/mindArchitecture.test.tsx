// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MindDashboardCard } from '../components/MindDashboardCard';
import { MindArchitectureModule } from '../modules/mind-architecture/MindArchitectureModule';
import { TopNav } from '../modules/mind-architecture/components/TopNav';
import type { KnowledgeDataset } from '../modules/mind-architecture/types/knowledge';
import { computeCelestialLayout, indexDataset } from '../modules/mind-architecture/utils/dataset';

const DATASET_PATH = resolve(process.cwd(), 'public/assets/aistudio/knowledge_extraction_v3_2556cc71.json');
const ORIGINAL_PATH = resolve(process.cwd(), 'public/assets/aistudio/knowledge_extraction_v3_1_a3a992a6.json');

function loadRealDataset(): KnowledgeDataset {
  return JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as KnowledgeDataset;
}

describe('MindArchitectureModule integration', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    vi.stubGlobal('scrollTo', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the runtime JSON dataset identical to the original archive and indexes all nodes and edges', () => {
    const runtimeText = readFileSync(DATASET_PATH, 'utf8');
    const originalText = readFileSync(ORIGINAL_PATH, 'utf8');
    expect(runtimeText).toBe(originalText);

    const raw = JSON.parse(runtimeText) as KnowledgeDataset;
    const indexed = indexDataset(raw);
    const layout = computeCelestialLayout(indexed);

    expect(indexed.raw.nodes.length).toBe(303);
    expect(indexed.raw.edges.length).toBe(357);
    expect(indexed.domainNodes.length).toBe(12);
    expect(indexed.sensitiveNodeIds.size).toBe(7);
    expect(layout.nodes.size).toBe(303);
    expect(layout.clusters.size).toBe(13);
  });

  it('omits the standalone wordmark in embedded TopNav and scopes the Cmd+K search shortcut', () => {
    const raw = loadRealDataset();
    render(<MindArchitectureModule initialData={raw} initialView="atlas" />);

    expect(screen.queryByRole('button', { name: 'The Architecture of My Mind' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Intellectual Atlas' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Personal Evolution' })[0]);
    expect(screen.getByRole('heading', { name: 'Personal Evolution' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Thinking Patterns' })[0]);
    expect(screen.getByRole('heading', { name: 'Thinking Patterns' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Evidence Explorer' })[0]);
    expect(screen.getByRole('heading', { name: 'Evidence Explorer' })).toBeTruthy();

    // Open CommandSearch via Cmd+K
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const dialog = screen.getByRole('dialog', { name: 'Search intellectual archive' });
    expect(dialog).toBeTruthy();

    // Close CommandSearch via Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Search intellectual archive' })).toBeNull();
  });

  it('renders standalone wordmark only when TopNav embedded is false', () => {
    render(<TopNav activeView="graph" onSelectView={vi.fn()} onOpenSearch={vi.fn()} embedded={false} />);
    expect(screen.getByRole('button', { name: 'The Architecture of My Mind' })).toBeTruthy();
  });

  it('triggers onOpen from MindDashboardCard Open button and mini constellation canvas', () => {
    const raw = loadRealDataset();
    const onOpen = vi.fn();
    render(<MindDashboardCard initialData={raw} onOpen={onOpen} />);

    expect(screen.getByText(/303/)).toBeTruthy();
    expect(screen.getByText(/357/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Open Mind Architecture constellation/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Open$/i }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('ignores Cmd+K when an InPursuit modal backdrop is active', () => {
    const raw = loadRealDataset();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    document.body.appendChild(backdrop);

    try {
      render(<MindArchitectureModule initialData={raw} initialView="atlas" />);
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      expect(screen.queryByRole('dialog', { name: 'Search intellectual archive' })).toBeNull();
    } finally {
      backdrop.remove();
    }
  });
});
