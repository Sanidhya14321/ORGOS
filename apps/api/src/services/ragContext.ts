export interface StageRagOptions {
  department?: string | null;
  branchId?: string | null;
}

export function buildCeoRagOptions(options: StageRagOptions = {}) {
  return {
    branchId: options.branchId ?? null,
    department: options.department ?? null,
    docTypes: ["structure", "process", "policy", "other"],
    knowledgeScopes: ["company", "product", "architecture", "org_structure", "project_brief"],
    sourceTypes: ["document_section", "report", "meeting_ingestion"]
  };
}

export function buildManagerRagOptions(options: StageRagOptions = {}) {
  return {
    branchId: options.branchId ?? null,
    department: options.department ?? null,
    docTypes: ["process", "policy", "other"],
    knowledgeScopes: ["company", "department_playbook", "sop", "project_brief", "runbook"],
    sourceTypes: ["document_section", "report", "meeting_ingestion"]
  };
}

export function buildIndividualRagOptions(options: StageRagOptions = {}) {
  return {
    branchId: options.branchId ?? null,
    department: options.department ?? null,
    docTypes: ["process", "policy", "other"],
    knowledgeScopes: ["department_playbook", "sop", "runbook", "project_brief"],
    sourceTypes: ["document_section", "report", "meeting_ingestion"]
  };
}

export function buildSynthesisRagOptions(options: StageRagOptions = {}) {
  return {
    branchId: options.branchId ?? null,
    department: options.department ?? null,
    docTypes: ["process", "policy", "other"],
    knowledgeScopes: ["company", "department_playbook", "runbook", "project_brief"],
    sourceTypes: ["document_section", "report", "meeting_ingestion"]
  };
}

export function buildRagProvenance(documents: Array<{
  id: string;
  sourceType: string;
  sourceId?: string | null;
  chunkIndex?: number;
  score: number;
  metadata?: Record<string, unknown>;
}>): Array<Record<string, unknown>> {
  return documents.map((document) => ({
    id: document.id,
    sourceType: document.sourceType,
    sourceId: document.sourceId ?? null,
    chunkIndex: document.chunkIndex ?? 0,
    score: Number(document.score.toFixed(4)),
    metadata: document.metadata ?? {}
  }));
}
