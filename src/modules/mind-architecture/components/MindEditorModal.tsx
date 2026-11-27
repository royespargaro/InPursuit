import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  GitMerge,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { auth } from '../../../services/firebase';
import {
  extractMindFromNotesOffline,
  type AddMindEdgeInput,
  type ExtractedMindBatch,
  type UpsertMindNodeInput,
} from '../services/mindBuilder';
import type {
  ConnectionBasis,
  EvidenceGrade,
  IndexedDataset,
  KnowledgeDataset,
  KnowledgeNode,
  MindWorkspaceProfile,
} from '../types/knowledge';

export type MindEditorTab = 'setup' | 'node' | 'edge' | 'notes';

interface MindEditorModalProps {
  isOpen: boolean;
  initialTab?: MindEditorTab;
  editingNode?: KnowledgeNode | null;
  profile: MindWorkspaceProfile;
  dataset: IndexedDataset;
  canSeedFromGoals: boolean;
  onClose: () => void;
  onUpdateProfile: (patch: Partial<Pick<MindWorkspaceProfile, 'title' | 'subtitle'>>) => void;
  onSwitchToSample: () => void;
  onStartBlank: () => void;
  onCloneSample: () => void;
  onSeedFromGoals: () => void;
  onUpsertNode: (input: UpsertMindNodeInput, ifSample?: 'blank' | 'clone') => string;
  onDeleteNode?: (nodeId: string) => void;
  onAddEdge: (input: AddMindEdgeInput, ifSample?: 'blank' | 'clone') => void;
  onAddSource: (
    input: { title: string; sourceType: string; excerpt?: string; date?: string },
    ifSample?: 'blank' | 'clone'
  ) => void;
  onImportBatch: (batch: ExtractedMindBatch, ifSample?: 'blank' | 'clone') => void;
  onImportJson: (raw: unknown, title?: string) => boolean;
}

const NODE_TYPES = ['Concept', 'Discipline', 'Question', 'Goal', 'Project', 'Hypothesis', 'Principle'];
const EVIDENCE_GRADES: EvidenceGrade[] = ['Q3', 'Q2', 'Q4', 'Q1'];
const RELATIONSHIPS = ['supports', 'explores', 'bridges', 'applies_to', 'depends_on', 'contradicts'];

export const MindEditorModal: React.FC<MindEditorModalProps> = ({
  isOpen,
  initialTab = 'setup',
  editingNode = null,
  profile,
  dataset,
  canSeedFromGoals,
  onClose,
  onUpdateProfile,
  onSwitchToSample,
  onStartBlank,
  onCloneSample,
  onSeedFromGoals,
  onUpsertNode,
  onDeleteNode,
  onAddEdge,
  onAddSource,
  onImportBatch,
  onImportJson,
}) => {
  const [tab, setTab] = useState<MindEditorTab>(editingNode ? 'node' : initialTab);
  const [sampleStrategy, setSampleStrategy] = useState<'blank' | 'clone'>('blank');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Setup fields
  const [titleInput, setTitleInput] = useState(profile.title);
  const [subtitleInput, setSubtitleInput] = useState(profile.subtitle);
  const jsonFileRef = useRef<HTMLInputElement | null>(null);

  // Node fields
  const [nodeTitle, setNodeTitle] = useState(editingNode?.title ?? '');
  const [nodeType, setNodeType] = useState(editingNode?.type ?? 'Concept');
  const existingDomains = useMemo(
    () =>
      Array.from(
        new Set(
          dataset.domainNodes
            .map((d) => d.title)
            .concat(dataset.raw.nodes.flatMap((n) => n.domains))
        )
      )
        .filter(Boolean)
        .sort(),
    [dataset]
  );
  const [nodeDomain, setNodeDomain] = useState(
    editingNode?.domains[0] ?? existingDomains[0] ?? 'Personal Synthesis'
  );
  const [newDomainName, setNewDomainName] = useState('');
  const [nodeGrade, setNodeGrade] = useState<EvidenceGrade>(editingNode?.evidence_grade ?? 'Q2');
  const [nodeDescription, setNodeDescription] = useState(editingNode?.description ?? '');
  const [nodeSourceTitle, setNodeSourceTitle] = useState('');

  // Edge + Source fields
  const selectableNodes = useMemo(
    () => [...dataset.raw.nodes].sort((a, b) => a.title.localeCompare(b.title)),
    [dataset.raw.nodes]
  );
  const [edgeSource, setEdgeSource] = useState(selectableNodes[0]?.id ?? '');
  const [edgeTarget, setEdgeTarget] = useState(selectableNodes[1]?.id ?? selectableNodes[0]?.id ?? '');
  const [edgeRelation, setEdgeRelation] = useState('supports');
  const [edgeBasis, setEdgeBasis] = useState<ConnectionBasis>('explicit');
  const [edgeExplanation, setEdgeExplanation] = useState('');

  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceType, setSourceType] = useState('journal_note');
  const [sourceExcerpt, setSourceExcerpt] = useState('');

  // Notes extraction fields
  const [notesLabel, setNotesLabel] = useState('Personal Reflection');
  const [notesText, setNotesText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [previewBatch, setPreviewBatch] = useState<ExtractedMindBatch | null>(null);

  if (!isOpen) return null;

  const showNotice = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({ title: titleInput, subtitle: subtitleInput });
    showNotice('Workspace identity updated.');
  };

  const handleExportJson = () => {
    const payload: KnowledgeDataset = dataset.raw;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.title.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'mind_architecture'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice('Mind Architecture JSON exported.');
  };

  const handleJsonUpload = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const ok = onImportJson(parsed, file.name.replace(/\.json$/i, ''));
      if (ok) {
        showNotice('Custom Mind Architecture JSON imported.');
      } else {
        showNotice('Invalid Mind JSON structure (requires nodes[] and edges[]).');
      }
    } catch {
      showNotice('Could not read JSON file.');
    } finally {
      if (jsonFileRef.current) jsonFileRef.current.value = '';
    }
  };

  const handleSubmitNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeTitle.trim()) return;
    const domainToUse = (newDomainName.trim() || nodeDomain.trim() || 'Personal Synthesis').slice(0, 100);
    onUpsertNode(
      {
        ...(editingNode ? { id: editingNode.id } : {}),
        title: nodeTitle,
        type: nodeType,
        domains: nodeType === 'Discipline' ? [nodeTitle.trim()] : [domainToUse],
        description: nodeDescription,
        evidence_grade: nodeGrade,
        sourceTitle: nodeSourceTitle.trim() || undefined,
      },
      sampleStrategy
    );
    showNotice(editingNode ? 'Node updated.' : `Added "${nodeTitle.trim()}" to your mind map.`);
    if (editingNode) {
      onClose();
    } else {
      setNodeTitle('');
      setNodeDescription('');
      setNodeSourceTitle('');
      setNewDomainName('');
    }
  };

  const handleSubmitEdge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!edgeSource || !edgeTarget || edgeSource === edgeTarget) {
      showNotice('Choose two different nodes to connect.');
      return;
    }
    onAddEdge(
      {
        source: edgeSource,
        target: edgeTarget,
        relationship: edgeRelation,
        basis: edgeBasis,
        explanation: edgeExplanation,
      },
      sampleStrategy
    );
    setEdgeExplanation('');
    showNotice('Connection added.');
  };

  const handleSubmitSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTitle.trim()) return;
    onAddSource(
      {
        title: sourceTitle,
        sourceType,
        excerpt: sourceExcerpt,
      },
      sampleStrategy
    );
    setSourceTitle('');
    setSourceExcerpt('');
    showNotice('Provenance source logged.');
  };

  const handleParseNotes = async (preferAi: boolean) => {
    const trimmed = notesText.trim();
    if (trimmed.length < 10) {
      showNotice('Paste at least a short paragraph or bullet list.');
      return;
    }

    if (preferAi && auth.currentUser) {
      setIsExtracting(true);
      try {
        const token = await auth.currentUser.getIdToken();
        const res = await fetch('/api/extract-mind', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            notesText: trimmed,
            sourceLabel: notesLabel.trim() || 'Personal Notes',
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as ExtractedMindBatch;
          setPreviewBatch(data);
          showNotice(`Extracted ${data.nodes.length} nodes & ${data.edges.length} links.`);
          setIsExtracting(false);
          return;
        }
      } catch {
        // Fall through cleanly to local deterministic parser
      } finally {
        setIsExtracting(false);
      }
    }

    const localBatch = extractMindFromNotesOffline(trimmed, notesLabel.trim() || 'Pasted Notes');
    setPreviewBatch(localBatch);
    showNotice(
      `Parsed ${localBatch.nodes.length} nodes & ${localBatch.edges.length} links locally.`
    );
  };

  const handleCommitBatch = () => {
    if (!previewBatch) return;
    onImportBatch(previewBatch, sampleStrategy);
    setPreviewBatch(null);
    setNotesText('');
    showNotice('Merged extracted knowledge into your mind map.');
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Customize Mind Architecture"
    >
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/[0.14] bg-[#0b0c10] text-[#f5f5f3] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#d4ff3a]">
              {profile.mode === 'custom' ? 'Personal Workspace' : 'Workspace Studio'}
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold tracking-tight truncate">
              {editingNode ? `Edit: ${editingNode.title}` : 'Customize Mind Architecture'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customize modal"
            className="p-2 rounded-full border border-white/[0.12] text-[#9ba3b0] hover:text-[#f5f5f3] transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        {!editingNode && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-white/[0.08] px-5 py-2.5">
            {(
              [
                { id: 'setup', label: 'Workspace' },
                { id: 'node', label: '+ Node / Domain' },
                { id: 'edge', label: '+ Link & Source' },
                { id: 'notes', label: 'Extract Notes' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`min-h-[34px] rounded-full border px-3.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  tab === t.id
                    ? 'border-[#d4ff3a]/55 bg-[#d4ff3a]/12 text-[#d4ff3a]'
                    : 'border-white/[0.09] text-[#9ba3b0] hover:text-[#f5f5f3]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {feedback && (
            <div className="flex items-center gap-2 rounded-xl border border-[#d4ff3a]/40 bg-[#d4ff3a]/10 px-3.5 py-2.5 text-xs text-[#d4ff3a]">
              <Check className="h-3.5 w-3.5 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          {profile.mode === 'sample' && tab !== 'setup' && (
            <div className="rounded-xl border border-[#ff8b3d]/35 bg-[#ff8b3d]/10 p-3.5 text-xs space-y-2">
              <p className="font-medium text-[#f5f5f3]">
                You are currently viewing the read-only Reference Archive.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSampleStrategy('blank')}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                    sampleStrategy === 'blank'
                      ? 'border-[#d4ff3a] bg-[#d4ff3a]/15 text-[#d4ff3a]'
                      : 'border-white/15 text-[#9ba3b0]'
                  }`}
                >
                  Start my own fresh mind with this
                </button>
                <button
                  type="button"
                  onClick={() => setSampleStrategy('clone')}
                  className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                    sampleStrategy === 'clone'
                      ? 'border-[#d4ff3a] bg-[#d4ff3a]/15 text-[#d4ff3a]'
                      : 'border-white/15 text-[#9ba3b0]'
                  }`}
                >
                  Clone sample archive + add
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: WORKSPACE & SETUP */}
          {tab === 'setup' && (
            <div className="space-y-6">
              <form onSubmit={handleSaveProfile} className="space-y-3.5">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#7f8794]">
                  Identity & Description
                </h3>
                <div>
                  <label className="block text-xs text-[#9ba3b0] mb-1">Workspace Title</label>
                  <input
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    maxLength={120}
                    className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2.5 text-sm text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                    placeholder="My Mind Architecture"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9ba3b0] mb-1">Short Description</label>
                  <textarea
                    rows={2}
                    value={subtitleInput}
                    onChange={(e) => setSubtitleInput(e.target.value)}
                    maxLength={320}
                    className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                    placeholder="Personal intellectual graph linking domains, inquiries, and active goals."
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#d4ff3a] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e2ff6e] transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Identity</span>
                </button>
              </form>

              <div className="border-t border-white/[0.08] pt-5 space-y-3">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#7f8794]">
                  Workspace Source & Templates
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {canSeedFromGoals && (
                    <button
                      type="button"
                      onClick={() => {
                        onSeedFromGoals();
                        showNotice('Built personal mind from your InPursuit goals & life areas.');
                      }}
                      className="flex items-start gap-3 rounded-xl border border-[#d4ff3a]/35 bg-[#d4ff3a]/8 p-3.5 text-left hover:bg-[#d4ff3a]/14 transition-colors"
                    >
                      <Sparkles className="h-4 w-4 text-[#d4ff3a] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-[#f5f5f3]">
                          Seed from My InPursuit Goals
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#9ba3b0]">
                          Convert your Life Areas, Goals, Phases, and Habits into nodes.
                        </p>
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onStartBlank();
                      showNotice('Started a fresh blank personal mind workspace.');
                    }}
                    className="flex items-start gap-3 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3.5 text-left hover:border-white/25 transition-colors"
                  >
                    <Plus className="h-4 w-4 text-[#d4ff3a] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-[#f5f5f3]">Start Fresh Blank Mind</p>
                      <p className="mt-0.5 text-[11px] text-[#9ba3b0]">
                        Begin cleanly with zero nodes and build from scratch.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onCloneSample();
                      showNotice('Cloned Reference Archive into your editable personal workspace.');
                    }}
                    className="flex items-start gap-3 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3.5 text-left hover:border-white/25 transition-colors"
                  >
                    <Copy className="h-4 w-4 text-[#89a8ff] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-[#f5f5f3]">
                        Clone Sample Archive
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#9ba3b0]">
                        Copy all 303 reference nodes so you can edit or prune them.
                      </p>
                    </div>
                  </button>

                  {profile.mode === 'custom' && (
                    <button
                      type="button"
                      onClick={() => {
                        onSwitchToSample();
                        showNotice('Switched back to Reference Archive view.');
                      }}
                      className="flex items-start gap-3 rounded-xl border border-white/[0.1] bg-white/[0.03] p-3.5 text-left hover:border-white/25 transition-colors"
                    >
                      <RotateCcw className="h-4 w-4 text-[#ff8b3d] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-[#f5f5f3]">
                          View Reference Archive
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#9ba3b0]">
                          Switch back to the read-only 303-node benchmark archive.
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-white/[0.08] pt-5 flex flex-wrap items-center gap-2.5">
                <input
                  ref={jsonFileRef}
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={(e) => void handleJsonUpload(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-white/[0.14] px-3.5 py-1.5 text-xs text-[#f5f5f3] hover:border-[#d4ff3a]/50 transition-colors"
                >
                  <Download className="h-3.5 w-3.5 text-[#d4ff3a]" />
                  <span>Export Mind JSON</span>
                </button>
                <button
                  type="button"
                  onClick={() => jsonFileRef.current?.click()}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-white/[0.14] px-3.5 py-1.5 text-xs text-[#f5f5f3] hover:border-[#d4ff3a]/50 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5 text-[#89a8ff]" />
                  <span>Import Mind JSON</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: ADD / EDIT NODE */}
          {tab === 'node' && (
            <form onSubmit={handleSubmitNode} className="space-y-4">
              <div>
                <label className="block text-xs text-[#9ba3b0] mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={nodeTitle}
                  onChange={(e) => setNodeTitle(e.target.value)}
                  maxLength={140}
                  placeholder="e.g., First-principles thinking, Systems Design, or Marathon block"
                  className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2.5 text-sm text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#9ba3b0] mb-1">Node Type</label>
                  <select
                    value={nodeType}
                    onChange={(e) => setNodeType(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.12] bg-[#121319] px-3 py-2.5 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                  >
                    {NODE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#9ba3b0] mb-1">Evidence Grade</label>
                  <select
                    value={nodeGrade}
                    onChange={(e) => setNodeGrade(e.target.value as EvidenceGrade)}
                    className="w-full rounded-xl border border-white/[0.12] bg-[#121319] px-3 py-2.5 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                  >
                    {EVIDENCE_GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g} · {g === 'Q4' ? 'Primary Transcript' : g === 'Q3' ? 'Practiced / Core' : g === 'Q2' ? 'Direct Summary' : 'Initial Hypothesis'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {nodeType !== 'Discipline' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#9ba3b0] mb-1">Existing Domain</label>
                    <select
                      value={nodeDomain}
                      onChange={(e) => setNodeDomain(e.target.value)}
                      className="w-full rounded-xl border border-white/[0.12] bg-[#121319] px-3 py-2.5 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                    >
                      {existingDomains.length === 0 ? (
                        <option value="Personal Synthesis">Personal Synthesis</option>
                      ) : (
                        existingDomains.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#9ba3b0] mb-1">
                      Or New Domain Name
                    </label>
                    <input
                      type="text"
                      value={newDomainName}
                      onChange={(e) => setNewDomainName(e.target.value)}
                      maxLength={100}
                      placeholder="Optional new domain…"
                      className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-[#9ba3b0] mb-1">Description / Synthesis</label>
                <textarea
                  rows={3}
                  value={nodeDescription}
                  onChange={(e) => setNodeDescription(e.target.value)}
                  maxLength={1200}
                  placeholder="What is this concept, why does it matter, and where does it show up?"
                  className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                />
              </div>

              {!editingNode && (
                <div>
                  <label className="block text-xs text-[#9ba3b0] mb-1">
                    Source Reference (optional)
                  </label>
                  <input
                    type="text"
                    value={nodeSourceTitle}
                    onChange={(e) => setNodeSourceTitle(e.target.value)}
                    maxLength={240}
                    placeholder="e.g., Journal entry 2026-11, Thinking in Systems ch. 2"
                    className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                {editingNode && onDeleteNode ? (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteNode(editingNode.id);
                      onClose();
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#ff8b3d]/40 px-3.5 py-1.5 text-xs text-[#ff8b3d] hover:bg-[#ff8b3d]/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Node</span>
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#d4ff3a] px-5 py-2 text-xs font-semibold text-black hover:bg-[#e2ff6e] transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{editingNode ? 'Save Changes' : 'Add to Mind Map'}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: ADD CONNECTION & SOURCE */}
          {tab === 'edge' && (
            <div className="space-y-6">
              <form onSubmit={handleSubmitEdge} className="space-y-3.5">
                <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#7f8794]">
                  <GitMerge className="h-3.5 w-3.5 text-[#d4ff3a]" />
                  <span>Connect Two Nodes</span>
                </h3>
                {selectableNodes.length < 2 ? (
                  <p className="text-xs text-[#9ba3b0]">
                    Add at least two nodes first before creating a connection.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[#9ba3b0] mb-1">From Node</label>
                        <select
                          value={edgeSource}
                          onChange={(e) => setEdgeSource(e.target.value)}
                          className="w-full rounded-xl border border-white/[0.12] bg-[#121319] px-3 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                        >
                          {selectableNodes.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.title} ({n.type})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-[#9ba3b0] mb-1">To Node</label>
                        <select
                          value={edgeTarget}
                          onChange={(e) => setEdgeTarget(e.target.value)}
                          className="w-full rounded-xl border border-white/[0.12] bg-[#121319] px-3 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                        >
                          {selectableNodes.map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.title} ({n.type})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[#9ba3b0] mb-1">Relationship</label>
                        <select
                          value={edgeRelation}
                          onChange={(e) => setEdgeRelation(e.target.value)}
                          className="w-full rounded-xl border border-white/[0.12] bg-[#121319] px-3 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                        >
                          {RELATIONSHIPS.map((rel) => (
                            <option key={rel} value={rel}>
                              {rel}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-[#9ba3b0] mb-1">Basis</label>
                        <select
                          value={edgeBasis}
                          onChange={(e) => setEdgeBasis(e.target.value as ConnectionBasis)}
                          className="w-full rounded-xl border border-white/[0.12] bg-[#121319] px-3 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                        >
                          <option value="explicit">Explicit (Verified link)</option>
                          <option value="user_suggested">User-Suggested chain</option>
                          <option value="inferred">Inferred (Queue for review)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-[#9ba3b0] mb-1">Explanation</label>
                      <input
                        type="text"
                        value={edgeExplanation}
                        onChange={(e) => setEdgeExplanation(e.target.value)}
                        maxLength={400}
                        placeholder="Why do these two concepts connect?"
                        className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#d4ff3a] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e2ff6e] transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Create Connection</span>
                    </button>
                  </>
                )}
              </form>

              <form
                onSubmit={handleSubmitSource}
                className="border-t border-white/[0.08] pt-5 space-y-3"
              >
                <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[#7f8794]">
                  <FileText className="h-3.5 w-3.5 text-[#89a8ff]" />
                  <span>Log Provenance Source</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      required
                      value={sourceTitle}
                      onChange={(e) => setSourceTitle(e.target.value)}
                      maxLength={240}
                      placeholder="Book, essay, conversation, or reflection title…"
                      className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                    />
                  </div>
                  <select
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value)}
                    className="w-full rounded-xl border border-white/[0.12] bg-[#121319] px-3 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                  >
                    <option value="journal_note">Journal note</option>
                    <option value="book_highlight">Book highlight</option>
                    <option value="ai_export">AI conversation</option>
                    <option value="essay_draft">Essay / Memo</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={sourceExcerpt}
                  onChange={(e) => setSourceExcerpt(e.target.value)}
                  maxLength={600}
                  placeholder="Optional key quote or excerpt…"
                  className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-white/[0.16] bg-white/[0.05] px-4 py-1.5 text-xs font-medium text-[#f5f5f3] hover:border-[#d4ff3a]/50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5 text-[#89a8ff]" />
                  <span>Add Source</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: EXTRACT FROM NOTES */}
          {tab === 'notes' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[#9ba3b0] mb-1">Source Label</label>
                <input
                  type="text"
                  value={notesLabel}
                  onChange={(e) => setNotesLabel(e.target.value)}
                  maxLength={120}
                  className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2 text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-[#9ba3b0] mb-1">
                  Paste Notes, Reflections, or Markdown Outline
                </label>
                <textarea
                  rows={6}
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder={`# Philosophy\n- Stoic Control: Separate effort from external outcomes\n- Deep Work -> Creative Output: Uninterrupted blocks compound insight\n- How do I balance curiosity with shipping?`}
                  className="w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-3.5 py-2.5 font-mono text-xs text-[#f5f5f3] focus:border-[#d4ff3a] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {auth.currentUser && (
                  <button
                    type="button"
                    disabled={isExtracting}
                    onClick={() => void handleParseNotes(true)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#d4ff3a] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#e2ff6e] transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{isExtracting ? 'Extracting…' : 'Extract with AI'}</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={isExtracting}
                  onClick={() => void handleParseNotes(false)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-white/[0.16] bg-white/[0.05] px-4 py-1.5 text-xs font-medium text-[#f5f5f3] hover:border-[#d4ff3a]/50 transition-colors"
                >
                  <span>Instant Local Parse</span>
                </button>
              </div>

              {previewBatch && (
                <div className="rounded-xl border border-[#d4ff3a]/35 bg-white/[0.03] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-[#d4ff3a]">
                      Ready to merge: {previewBatch.nodes.length} nodes · {previewBatch.edges.length} links
                    </p>
                    <button
                      type="button"
                      onClick={handleCommitBatch}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-[#d4ff3a] px-3.5 py-1 text-xs font-semibold text-black hover:bg-[#e2ff6e]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Add to My Mind</span>
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs text-[#d6d9e0]">
                    {previewBatch.nodes.map((n, idx) => (
                      <div key={`${n.title}-${idx}`} className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{n.title}</span>
                        <span className="font-mono text-[10px] text-[#9ba3b0] shrink-0">
                          {n.domain} · {n.type} · {n.evidence_grade}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
