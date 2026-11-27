import type {
  ConnectionBasis,
  EvidenceGrade,
  IndexedDataset,
  KnowledgeDataset,
  KnowledgeEdge,
  KnowledgeNode,
  KnowledgeSource,
} from '../types/knowledge';

export interface DomainTheme {
  color: string;
  shortName: string;
  roman: string;
  thinNotice?: string;
}

export const GRADE_META: Record<EvidenceGrade, { label: string; color: string }> = {
  Q4: { label: 'Q4 · Original Conversation', color: '#89a8ff' },
  Q3: { label: 'Q3 · Practice / Multi-Summary', color: '#d4ff3a' },
  Q2: { label: 'Q2 · Single Summary', color: '#b4bac4' },
  Q1: { label: 'Q1 · Brief / Assistant Proposal', color: '#ff8b3d' },
};

export const BASIS_META: Record<
  ConnectionBasis,
  {
    label: string;
    shortLabel: string;
    color: string;
    dash: string;
    ruleNote: string;
  }
> = {
  explicit: {
    label: 'Explicit (Stated in Source)',
    shortLabel: 'Explicit',
    color: '#d4ff3a',
    dash: 'none',
    ruleNote: 'Directly stated relationship in summary or memory note.',
  },
  user_suggested: {
    label: 'User-Suggested (Brief Example)',
    shortLabel: 'User-Suggested',
    color: '#72e3a8',
    dash: '6 3',
    ruleNote: 'Proposed as an illustrative chain in your project brief—not prior exploration.',
  },
  co_discussed: {
    label: 'Co-Discussed (Same Entry)',
    shortLabel: 'Co-Discussed',
    color: '#89a8ff',
    dash: '4 4',
    ruleNote: 'Items appear together within a single summary entry.',
  },
  inferred: {
    label: 'Inferred (Assistant Hypothesis)',
    shortLabel: 'Inferred',
    color: '#ff8b3d',
    dash: '2 4',
    ruleNote: 'Assistant proposal with a rationale; requires user confirmation or dismissal.',
  },
  structural: {
    label: 'Structural (Taxonomy Grouping)',
    shortLabel: 'Structural',
    color: '#5b6475',
    dash: '2 5',
    ruleNote: 'Parent/child listing or organizational grouping only.',
  },
  established_academic: {
    label: 'Established Academic (Reserved)',
    shortLabel: 'Academic',
    color: '#9ba3b0',
    dash: '8 4',
    ruleNote: 'Reserved for externally cited academic relationships; none present.',
  },
};

const DOMAIN_THEMES: Record<string, DomainTheme> = {
  'Philosophy and human thought': {
    color: '#A99CE2',
    shortName: 'Philosophy',
    roman: 'I',
    thinNotice: '16 of 27 nodes are Q1 brief-only or assistant-proposed with 0 practice evidence',
  },
  'Psychology and human behavior': {
    color: '#D48A9E',
    shortName: 'Psychology',
    roman: 'II',
  },
  'Cognition and learning': {
    color: '#7DB5CA',
    shortName: 'Cognition',
    roman: 'III',
    thinNotice: '11 nodes (0 Q3, 0 practice or experience evidence, 0 explicit edges)',
  },
  'Politics and international relations': {
    color: '#C78A75',
    shortName: 'Politics & IR',
    roman: 'IV',
    thinNotice: '21 nodes with 0 Q3 practice evidence and no explicitly recorded links',
  },
  'Economics, finance, and wealth': {
    color: '#d4ff3a',
    shortName: 'Economics & Finance',
    roman: 'V',
  },
  'Business and entrepreneurship': {
    color: '#E09F5A',
    shortName: 'Business',
    roman: 'VI',
  },
  'Technology and AI': {
    color: '#6CA8DC',
    shortName: 'Technology & AI',
    roman: 'VII',
  },
  'Education and international mobility': {
    color: '#78AD8E',
    shortName: 'Education & Mobility',
    roman: 'VIII',
  },
  'Religion, spirituality, and values': {
    color: '#C6A3D6',
    shortName: 'Spirituality & Values',
    roman: 'IX',
    thinNotice: '12 nodes (0 Q3, no practice evidence or explicit edges)',
  },
  'Health, fitness, and physical development': {
    color: '#6BB8A6',
    shortName: 'Health & Fitness',
    roman: 'X',
    thinNotice: '12 nodes (0 Q3, brief summary entries only with no explicit edges)',
  },
  'Aesthetics, design, and culture': {
    color: '#CE8C72',
    shortName: 'Aesthetics & Design',
    roman: 'XI',
  },
  'Personal development and life architecture': {
    color: '#9CB874',
    shortName: 'Life Architecture',
    roman: 'XII',
  },
  '(no domain)': {
    color: '#8C95A6',
    shortName: 'Unmapped',
    roman: 'Ø',
    thinNotice: '20 unassigned hypotheses and undated conversation titles with 0 domain links',
  },
};

const FALLBACK_PALETTE = [
  '#d4ff3a',
  '#89a8ff',
  '#72e3a8',
  '#ff8b3d',
  '#A99CE2',
  '#6BB8A6',
];

export function getDomainTheme(domain?: string): DomainTheme {
  if (!domain) return DOMAIN_THEMES['(no domain)'];
  const exact = DOMAIN_THEMES[domain];
  if (exact) return exact;

  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
  }
  return {
    color: FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length],
    shortName: domain.length > 22 ? `${domain.slice(0, 20)}…` : domain,
    roman: '·',
  };
}

export function indexDataset(raw: KnowledgeDataset): IndexedDataset {
  const nodeById = new Map<string, KnowledgeNode>();
  const sourceById = new Map<string, KnowledgeSource>();
  const edgesByNodeId = new Map<string, KnowledgeEdge[]>();
  const domainNodes: KnowledgeNode[] = [];
  const sensitiveNodeIds = new Set<string>();

  const sensitiveLookup = new Set(
    (raw.data_quality?.sensitive_review ?? []).map((entry) => entry.trim().toLowerCase())
  );

  for (const src of raw.sources) {
    sourceById.set(src.id, src);
  }

  for (const node of raw.nodes) {
    nodeById.set(node.id, node);
    edgesByNodeId.set(node.id, []);
    if (node.type === 'Discipline') {
      domainNodes.push(node);
    }
    if (
      sensitiveLookup.has(node.id.toLowerCase()) ||
      sensitiveLookup.has(node.title.toLowerCase())
    ) {
      sensitiveNodeIds.add(node.id);
    }
  }

  for (const edge of raw.edges) {
    const srcList = edgesByNodeId.get(edge.source);
    if (srcList) srcList.push(edge);
    if (edge.target !== edge.source) {
      const tgtList = edgesByNodeId.get(edge.target);
      if (tgtList) tgtList.push(edge);
    }
  }

  return {
    raw,
    nodeById,
    sourceById,
    edgesByNodeId,
    domainNodes,
    sensitiveNodeIds,
  };
}

export interface ClusterAnchor {
  domain: string;
  x: number;
  y: number;
  orbitRadius: number;
  nodeCount: number;
  theme: DomainTheme;
}

export interface PositionedNode {
  node: KnowledgeNode;
  x: number;
  y: number;
  radius: number;
  color: string;
  primaryDomain: string;
  isBridge: boolean;
}

export interface CelestialLayout {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  clusters: Map<string, ClusterAnchor>;
  nodes: Map<string, PositionedNode>;
}

function nodeRadiusFor(node: KnowledgeNode): number {
  if (node.type === 'Discipline') return 13.5;
  if (node.type === 'Subdiscipline') return 8.2;
  if (node.evidence_grade === 'Q4') return 6.8;
  if (node.evidence_grade === 'Q3') return 5.8;
  if (node.type === 'Hypothesis' || node.type === 'Goal' || node.type === 'Project') {
    return 5.2;
  }
  return node.evidence_grade === 'Q2' ? 4.3 : 3.5;
}

function stableHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function computeCelestialLayout(dataset: IndexedDataset): CelestialLayout {
  const width = 2400;
  const height = 2400;
  const centerX = width / 2;
  const centerY = height / 2;

  const clusters = new Map<string, ClusterAnchor>();
  const positionedNodes = new Map<string, PositionedNode>();

  // Group nodes by their primary domain
  const domainGroups = new Map<string, KnowledgeNode[]>();
  const disciplineOrder = dataset.domainNodes.map((d) => d.title);
  for (const dom of disciplineOrder) {
    domainGroups.set(dom, []);
  }
  domainGroups.set('(no domain)', []);

  for (const node of dataset.raw.nodes) {
    const primary = node.domains[0] ?? '(no domain)';
    const bucket = domainGroups.get(primary);
    if (bucket) {
      bucket.push(node);
    } else {
      domainGroups.set(primary, [node]);
    }
  }

  // Place Discipline constellations at 30-degree intervals on outer astrolabe ring (r = 810)
  const disciplineKeys = Array.from(domainGroups.keys()).filter((k) => k !== '(no domain)');
  const ringRadius = 810;

  disciplineKeys.forEach((domain, idx) => {
    const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / Math.max(1, disciplineKeys.length);
    const cx = centerX + Math.cos(angle) * ringRadius;
    const cy = centerY + Math.sin(angle) * ringRadius;
    const members = domainGroups.get(domain) ?? [];
    const orbitRadius = Math.max(96, Math.min(182, 74 + Math.sqrt(members.length) * 16));
    const theme = getDomainTheme(domain);

    clusters.set(domain, {
      domain,
      x: cx,
      y: cy,
      orbitRadius,
      nodeCount: members.length,
      theme,
    });

    layoutClusterMembers(
      members,
      domain,
      cx,
      cy,
      orbitRadius,
      theme.color,
      positionedNodes
    );
  });

  // Place unmapped nodes cleanly inside the inner core astrolabe ring
  const unmapped = domainGroups.get('(no domain)') ?? [];
  if (unmapped.length > 0) {
    const orbitRadius = Math.max(115, Math.min(175, 80 + Math.sqrt(unmapped.length) * 15));
    const theme = getDomainTheme('(no domain)');
    clusters.set('(no domain)', {
      domain: '(no domain)',
      x: centerX,
      y: centerY,
      orbitRadius,
      nodeCount: unmapped.length,
      theme,
    });

    layoutClusterMembers(
      unmapped,
      '(no domain)',
      centerX,
      centerY,
      orbitRadius,
      theme.color,
      positionedNodes
    );
  }

  return {
    width,
    height,
    centerX,
    centerY,
    clusters,
    nodes: positionedNodes,
  };
}

function layoutClusterMembers(
  members: KnowledgeNode[],
  primaryDomain: string,
  cx: number,
  cy: number,
  orbitRadius: number,
  domainColor: string,
  out: Map<string, PositionedNode>
) {
  const disciplines = members.filter((n) => n.type === 'Discipline');
  const subdisciplines = members
    .filter((n) => n.type === 'Subdiscipline')
    .sort((a, b) => a.title.localeCompare(b.title));
  const others = members
    .filter((n) => n.type !== 'Discipline' && n.type !== 'Subdiscipline')
    .sort((a, b) => {
      const gradeRank: Record<string, number> = { Q4: 0, Q3: 1, Q2: 2, Q1: 3 };
      const diff = (gradeRank[a.evidence_grade] ?? 9) - (gradeRank[b.evidence_grade] ?? 9);
      return diff !== 0 ? diff : a.title.localeCompare(b.title);
    });

  // Discipline sits at constellation center
  disciplines.forEach((node, idx) => {
    const offset = idx === 0 ? { x: 0, y: 0 } : { x: idx * 24, y: 0 };
    out.set(node.id, {
      node,
      x: cx + offset.x,
      y: cy + offset.y,
      radius: nodeRadiusFor(node),
      color: domainColor,
      primaryDomain,
      isBridge: node.domains.length > 1,
    });
  });

  // Subdisciplines orbit the inner ring
  const subRingR = orbitRadius * 0.42;
  subdisciplines.forEach((node, idx) => {
    const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / Math.max(1, subdisciplines.length);
    out.set(node.id, {
      node,
      x: cx + Math.cos(angle) * subRingR,
      y: cy + Math.sin(angle) * subRingR,
      radius: nodeRadiusFor(node),
      color: domainColor,
      primaryDomain,
      isBridge: node.domains.length > 1,
    });
  });

  // Remaining nodes fill a deterministic Fibonacci spiral inside the orbit boundary
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const minR = disciplines.length > 0 ? Math.max(30, orbitRadius * 0.28) : 22;
  const maxR = orbitRadius - 10;

  others.forEach((node, idx) => {
    const t = (idx + 0.5) / Math.max(1, others.length);
    const jitter = (stableHash(node.id) - 0.5) * 0.25;
    const r = minR + Math.sqrt(t) * Math.max(16, maxR - minR);
    const angle = idx * goldenAngle + jitter;

    out.set(node.id, {
      node,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      radius: nodeRadiusFor(node),
      color: domainColor,
      primaryDomain,
      isBridge: node.domains.length > 1,
    });
  });
}
