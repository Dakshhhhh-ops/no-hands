import type { Project } from '../types/schema.ts';

export type AdrStatus = 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';

export interface ArchitectureDecisionRecord {
  id: string; // e.g. "ADR-001"
  title: string;
  status: AdrStatus;
  date: string;
  context: string;
  decision: string;
  consequences: {
    positive: string[];
    negative: string[];
  };
  complianceSignoffs: Array<{
    role: 'Principal Architect' | 'Security Lead' | 'SRE / Infrastructure Lead' | 'Product Owner';
    signee: string;
    approved: boolean;
    timestamp?: string;
  }>;
}

export const SIGNOFF_ROLES = ['Principal Architect', 'Security Lead', 'SRE / Infrastructure Lead', 'Product Owner'] as const;

export interface ReviewChecklist {
  isSecurityApproved: boolean;
  isInfrastructureApproved: boolean;
  isProductApproved: boolean;
  canMergeToProduction: boolean;
}

/**
 * Automatically synthesizes standard Architecture Decision Records (ADRs)
 * from voice commands, applied changes, and confirmed requirements.
 */
export function generateAdrFromChange(
  project: Project,
  changeIndex = 0
): ArchitectureDecisionRecord {
  const change = project.changes?.[changeIndex] || {
    id: 'CHG-DEFAULT',
    originalInstruction: 'Baseline Architecture Initialization',
    summary: 'Loaded baseline commerce microservices.',
  };

  const positive: string[] = [];
  const negative: string[] = [];

  // Deduce consequences based on requirements
  const hasRateLimit = project.requirements.some((r) => /rate.?limit/i.test(r.text));
  const hasRedisFallback = project.requirements.some((r) => /redis/i.test(r.text) && /(fallback|unavailable|resilien)/i.test(r.text));
  const hasPostgresTruth = project.requirements.some((r) => /postgres/i.test(r.text) && /source of truth/i.test(r.text));

  if (hasRateLimit) {
    positive.push('Protects authentication API gateway against denial-of-service and credential stuffing.');
    negative.push('Adds state tracking overhead in Redis session cache.');
  }
  if (hasRedisFallback) {
    positive.push('Prevents global login outages when session caching cluster is degraded.');
    negative.push('Direct fallback to PostgreSQL increases database connection pool pressure during Redis outages.');
  }
  if (hasPostgresTruth) {
    positive.push('Preserves strong ACID transactional guarantees and durable audit records.');
  }

  if (positive.length === 0) {
    positive.push('Clarifies architectural responsibilities and boundaries.');
  }
  if (negative.length === 0) {
    negative.push('Requires regression testing of internal service mesh routing.');
  }

  return {
    id: `ADR-${String(project.version).padStart(3, '0')}`,
    title: `Architecture Decision: ${change.summary || change.originalInstruction}`,
    status: 'PROPOSED',
    date: new Date().toISOString().slice(0, 10),
    context: `Architecture change requested via natural language instruction: "${change.originalInstruction}". Evaluated across ${project.components.length} components and ${project.relationships.length} data connections.`,
    decision: `We apply and formalize the change to ${change.affectedArtifacts?.join(', ') || 'system components'}. ${change.summary}`,
    consequences: {
      positive,
      negative,
    },
    // Nobody has reviewed this yet: every role starts pending and unassigned.
    // Approvals come only from a person marking them in the review dialog.
    complianceSignoffs: SIGNOFF_ROLES.map((role) => ({ role, signee: 'Unassigned', approved: false })),
  };
}

/**
 * Converts an ADR into standard Markdown format (Nygard ADR format).
 */
export function formatAdrMarkdown(adr: ArchitectureDecisionRecord): string {
  return `# ${adr.id}: ${adr.title}

- **Status**: ${adr.status}
- **Date**: ${adr.date}

## Context
${adr.context}

## Decision
${adr.decision}

## Consequences
### Positive
${adr.consequences.positive.map((p) => `- ${p}`).join('\n')}

### Negative / Trade-offs
${adr.consequences.negative.map((n) => `- ${n}`).join('\n')}

## Multi-Role Sign-off Matrix
| Role | Signee | Approved | Timestamp |
| :--- | :--- | :---: | :--- |
${adr.complianceSignoffs.map((s) => `| ${s.role} | ${s.signee} | ${s.approved ? '✅ APPROVED' : '⏳ PENDING'} | ${s.timestamp || 'Pending sign-off'} |`).join('\n')}
`;
}

