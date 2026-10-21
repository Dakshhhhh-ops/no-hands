import { z } from 'zod';

/* ==========================================================================
   VoiceArchitect Domain Schema & Type Definitions
   Zod schemas, validation, and explicit foreign keys
   ========================================================================== */

export const ComponentTypeEnum = z.enum([
  'CLIENT',
  'GATEWAY',
  'SERVICE',
  'CACHE',
  'DATABASE',
  'QUEUE',
  'EXTERNAL',
]);
export type ComponentType = z.infer<typeof ComponentTypeEnum>;

export const NetworkZoneEnum = z.enum([
  'PUBLIC_INTERNET',
  'DMZ',
  'PRIVATE_VPC',
  'SECURE_STORAGE',
  'EXTERNAL_SAAS',
]);
export type NetworkZone = z.infer<typeof NetworkZoneEnum>;

export const ComponentSchema = z.object({
  id: z.string().min(1, 'Component ID is required'),
  name: z.string().min(1, 'Component name is required'),
  type: ComponentTypeEnum,
  sub: z.string().default(''),
  responsibilities: z.array(z.string()).default([]),
  x: z.number().default(0),
  y: z.number().default(0),
  networkZone: NetworkZoneEnum.optional(),
  /** 'code' when the component came from an imported docker-compose file. */
  origin: z.literal('code').optional(),
  sourceChangeId: z.string().optional(),
  originalInstruction: z.string().optional(),
});
export type Component = z.infer<typeof ComponentSchema>;

export const RelationshipSchema = z.object({
  from: z.string().min(1, 'Source component ID is required'),
  to: z.string().min(1, 'Target component ID is required'),
  label: z.string().min(1, 'Relationship label is required'),
  protocol: z.string().optional(),
  /** 'code' when the connection was found as evidence in an imported docker-compose file. */
  origin: z.literal('code').optional(),
  sourceChangeId: z.string().optional(),
  originalInstruction: z.string().optional(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export const ApiOperationSchema = z.object({
  id: z.string().min(1, 'API Operation ID is required'),
  componentId: z.string().min(1, 'Associated component ID is required'),
  method: z.enum(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']),
  path: z.string().startsWith('/', 'Path must start with /'),
  summary: z.string().default(''),
  description: z.string().optional(),
  sourceChangeId: z.string().optional(),
  originalInstruction: z.string().optional(),
});
export type ApiOperation = z.infer<typeof ApiOperationSchema>;

export const RequirementStatusEnum = z.enum(['confirmed', 'draft', 'unresolved', 'deprecated']);
export type RequirementStatus = z.infer<typeof RequirementStatusEnum>;

export const RequirementSchema = z.object({
  id: z.string().regex(/^REQ-[A-Z0-9-]+$/, 'Requirement ID must follow REQ-* convention'),
  text: z.string().min(1, 'Requirement text cannot be empty'),
  resolution: z.string().trim().min(1).optional(),
  status: RequirementStatusEnum.default('confirmed'),
  sourceChangeId: z.string().optional(),
  originalInstruction: z.string().optional(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const ChangeRecordSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  originalInstruction: z.string().min(1),
  summary: z.string(),
  affectedArtifacts: z.array(z.string()).default([]),
  timestamp: z.number().int().nonnegative().optional(),
});
export type ChangeRecord = z.infer<typeof ChangeRecordSchema>;

export const ActivityRecordSchema = z.object({
  version: z.number().int().positive(),
  summary: z.string(),
  sourceChangeId: z.string(),
  originalInstruction: z.string(),
  timestamp: z.number().int().nonnegative().optional(),
});
export type ActivityRecord = z.infer<typeof ActivityRecordSchema>;

export const ProposalItemSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  detail: z.string(),
});
export type ProposalItem = z.infer<typeof ProposalItemSchema>;

/* ==========================================================================
   Model-proposed architecture operations
   Claude returns a list of these; a deterministic applier executes them and the
   resulting project is re-validated with ProjectSchema before it is accepted.
   Nullable (not optional) fields keep the schema compatible with structured outputs.
   ========================================================================== */

const HttpMethodEnum = z.enum(['get', 'post', 'put', 'patch', 'delete']);

export const ArchitectureOperationSchema = z.union([
  z.object({
    op: z.literal('add_component'),
    id: z.string(),
    name: z.string(),
    type: ComponentTypeEnum,
    sub: z.string(),
    responsibilities: z.array(z.string()),
  }),
  z.object({
    op: z.literal('update_component'),
    id: z.string(),
    name: z.string().nullable(),
    type: ComponentTypeEnum.nullable(),
    sub: z.string().nullable(),
    responsibilities: z.array(z.string()).nullable(),
  }),
  z.object({ op: z.literal('remove_component'), id: z.string() }),
  z.object({
    op: z.literal('add_relationship'),
    from: z.string(),
    to: z.string(),
    label: z.string(),
    protocol: z.string().nullable(),
  }),
  z.object({
    op: z.literal('update_relationship'),
    from: z.string(),
    to: z.string(),
    label: z.string().nullable(),
    protocol: z.string().nullable(),
  }),
  z.object({ op: z.literal('remove_relationship'), from: z.string(), to: z.string() }),
  z.object({
    op: z.literal('add_api_operation'),
    id: z.string(),
    componentId: z.string(),
    method: HttpMethodEnum,
    path: z.string(),
    summary: z.string(),
  }),
  z.object({ op: z.literal('remove_api_operation'), id: z.string() }),
  z.object({
    op: z.literal('add_requirement'),
    id: z.string(),
    text: z.string(),
    status: z.enum(['confirmed', 'unresolved']),
    /** The team's concrete choice (a threshold, a fallback), or null when none was stated. */
    resolution: z.string().nullable().optional(),
  }),
]);
export type ArchitectureOperation = z.infer<typeof ArchitectureOperationSchema>;

/** The exact shape Claude must return (sent as the structured-output schema). */
export const InterpretationSchema = z.object({
  understood: z.boolean(),
  summary: z.string(),
  items: z.array(z.object({ title: z.string(), detail: z.string() })),
  assumptions: z.array(z.string()),
  operations: z.array(ArchitectureOperationSchema),
});
export type Interpretation = z.infer<typeof InterpretationSchema>;

export const ProposalSchema = z.object({
  text: z.string(),
  items: z.array(ProposalItemSchema).min(1, 'Proposal must contain at least one item'),
  assumptions: z.array(z.string()).default([]),
  /**
   * 'ai' and 'drift' proposals carry operations; 'rules' proposals use the offline
   * keyword rules. 'drift' proposals sync the model with a newer docker-compose file.
   * 'resolve' proposals carry the fixes chosen for open risk findings.
   */
  source: z.enum(['ai', 'rules', 'drift', 'resolve']).optional(),
  operations: z.array(ArchitectureOperationSchema).optional(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const RiskFindingKindEnum = z.enum([
  'Potential risk',
  'Unresolved decision',
  'Requirement coverage',
  'Consistency check',
]);
export type RiskFindingKind = z.infer<typeof RiskFindingKindEnum>;

/* Explicit Foreign Keys for Risk Findings */
export const RiskFindingSchema = z.object({
  kind: RiskFindingKindEnum,
  title: z.string().min(1),
  description: z.string(),
  evidence: z.array(z.string()),
  /** 'open' needs a decision or a model change; 'resolved' is recorded or passing. */
  status: z.enum(['open', 'resolved']).optional(),
  /** Links an open finding to the fix that resolves it (see riskResolution.js). */
  fixKey: z.string().optional(),
  requirementId: z.string().optional(),       // Direct foreign key
  sourceChangeId: z.string().optional(),      // Direct foreign key
  originalInstruction: z.string().optional(), // Direct provenance
});
export type RiskFinding = z.infer<typeof RiskFindingSchema>;

/* Explicit Foreign Keys for Engineering Tasks */
export const TaskPriorityEnum = z.enum(['High', 'Medium', 'Low']);
export type TaskPriority = z.infer<typeof TaskPriorityEnum>;

export const TaskSchema = z.object({
  id: z.string().regex(/^TASK-[A-Z0-9-]+$/, 'Task ID must follow TASK-* convention'),
  epic: z.string().min(1),
  title: z.string().min(1),
  priority: TaskPriorityEnum,
  requirement: RequirementSchema,
  acceptance: z.array(z.string()).min(1, 'Task must specify at least one acceptance criterion'),
  unresolved: z.string(),
  requirementId: z.string().optional(),       // Direct foreign key
  sourceChangeId: z.string().optional(),      // Direct foreign key
  originalInstruction: z.string().optional(), // Direct provenance
});
export type Task = z.infer<typeof TaskSchema>;

export const ManualDecisionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  detail: z.string(),
  changeId: z.string(),
  instruction: z.string(),
  requirementId: z.string().optional(),
});
export type ManualDecision = z.infer<typeof ManualDecisionSchema>;

/* Canonical Project Model Schema with Referential Integrity Verification */
export const ProjectSchema = z.object({
  name: z.string().min(1),
  version: z.number().int().positive(),
  changed: z.boolean(),
  changes: z.array(ChangeRecordSchema).default([]),
  components: z.array(ComponentSchema),
  relationships: z.array(RelationshipSchema),
  apiOperations: z.array(ApiOperationSchema).default([]),
  requirements: z.array(RequirementSchema).default([]),
  activity: z.array(ActivityRecordSchema).default([]),
  baseline: z.any().optional(),
  exportMetadata: z.any().optional(),
}).superRefine((project, ctx) => {
  // Referential Integrity: Every relationship must reference valid component IDs
  const componentIds = new Set(project.components.map((c) => c.id));
  project.relationships.forEach((rel, index) => {
    if (!componentIds.has(rel.from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Relationship references non-existent source component: "${rel.from}"`,
        path: ['relationships', index, 'from'],
      });
    }
    if (!componentIds.has(rel.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Relationship references non-existent target component: "${rel.to}"`,
        path: ['relationships', index, 'to'],
      });
    }
  });

  // Referential Integrity: Every ApiOperation must reference an existing component
  project.apiOperations.forEach((op, index) => {
    if (!componentIds.has(op.componentId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `API operation references non-existent component: "${op.componentId}"`,
        path: ['apiOperations', index, 'componentId'],
      });
    }
  });
});
export type Project = z.infer<typeof ProjectSchema>;

/* Validation Helpers */
export function validateProject(data: unknown): Project {
  return ProjectSchema.parse(data);
}

export function validateProposal(data: unknown): Proposal {
  return ProposalSchema.parse(data);
}

export function validateRequirement(data: unknown): Requirement {
  return RequirementSchema.parse(data);
}

export function safeValidateProject(data: unknown) {
  return ProjectSchema.safeParse(data);
}

