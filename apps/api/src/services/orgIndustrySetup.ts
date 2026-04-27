import type { FastifyInstance } from "fastify";

export const IndustryValues = [
  "tech",
  "legal",
  "healthcare",
  "construction",
  "finance",
  "retail",
  "manufacturing",
  "education",
  "nonprofit",
  "hospitality"
] as const;

export type Industry = (typeof IndustryValues)[number];

export const CompanySizeValues = ["startup", "mid", "enterprise"] as const;
export type CompanySize = (typeof CompanySizeValues)[number];

type PositionSeed = {
  title: string;
  level: number;
};

type WorkflowStage = {
  name: string;
  label: string;
  color: string;
  is_terminal: boolean;
};

type IndustrySeedConfig = {
  workWeekHours: number;
  positions: PositionSeed[];
  workflowName: string;
  workflowStages: WorkflowStage[];
};

const DEFAULT_COLORS = {
  neutral: "#6366F1",
  progress: "#0EA5E9",
  review: "#A855F7",
  warn: "#F59E0B",
  success: "#22C55E",
  done: "#10B981"
} as const;

const INDUSTRY_CONFIG: Record<Industry, IndustrySeedConfig> = {
  tech: {
    workWeekHours: 40,
    positions: [
      { title: "CEO", level: 0 },
      { title: "CFO", level: 0 },
      { title: "Engineering Manager", level: 1 },
      { title: "Product Manager", level: 1 },
      { title: "Software Engineer", level: 2 }
    ],
    workflowName: "Tech Task Workflow",
    workflowStages: [
      { name: "pending", label: "Pending", color: DEFAULT_COLORS.neutral, is_terminal: false },
      { name: "in_progress", label: "In Progress", color: DEFAULT_COLORS.progress, is_terminal: false },
      { name: "review", label: "Review", color: DEFAULT_COLORS.review, is_terminal: false },
      { name: "completed", label: "Completed", color: DEFAULT_COLORS.done, is_terminal: true }
    ]
  },
  legal: {
    workWeekHours: 40,
    positions: [
      { title: "Managing Partner", level: 0 },
      { title: "Finance Partner", level: 0 },
      { title: "Practice Manager", level: 1 },
      { title: "Senior Counsel", level: 1 },
      { title: "Associate", level: 2 }
    ],
    workflowName: "Legal Matter Workflow",
    workflowStages: [
      { name: "draft", label: "Draft", color: DEFAULT_COLORS.neutral, is_terminal: false },
      { name: "review", label: "Review", color: DEFAULT_COLORS.review, is_terminal: false },
      { name: "approved", label: "Approved", color: DEFAULT_COLORS.success, is_terminal: false },
      { name: "filed", label: "Filed", color: DEFAULT_COLORS.progress, is_terminal: false },
      { name: "closed", label: "Closed", color: DEFAULT_COLORS.done, is_terminal: true }
    ]
  },
  healthcare: {
    workWeekHours: 40,
    positions: [
      { title: "Chief Medical Officer", level: 0 },
      { title: "Chief Financial Officer", level: 0 },
      { title: "Department Head", level: 1 },
      { title: "Attending Physician", level: 1 },
      { title: "Nurse", level: 2 }
    ],
    workflowName: "Healthcare Case Workflow",
    workflowStages: [
      { name: "assigned", label: "Assigned", color: DEFAULT_COLORS.neutral, is_terminal: false },
      { name: "in_progress", label: "In Progress", color: DEFAULT_COLORS.progress, is_terminal: false },
      { name: "pending_review", label: "Pending Review", color: DEFAULT_COLORS.review, is_terminal: false },
      { name: "approved", label: "Approved", color: DEFAULT_COLORS.success, is_terminal: false },
      { name: "completed", label: "Completed", color: DEFAULT_COLORS.done, is_terminal: true }
    ]
  },
  construction: {
    workWeekHours: 45,
    positions: [
      { title: "General Manager", level: 0 },
      { title: "Finance Director", level: 0 },
      { title: "Project Manager", level: 1 },
      { title: "Site Supervisor", level: 1 },
      { title: "Foreman", level: 2 }
    ],
    workflowName: "Construction Delivery Workflow",
    workflowStages: [
      { name: "planned", label: "Planned", color: DEFAULT_COLORS.neutral, is_terminal: false },
      { name: "procured", label: "Procured", color: DEFAULT_COLORS.warn, is_terminal: false },
      { name: "in_progress", label: "In Progress", color: DEFAULT_COLORS.progress, is_terminal: false },
      { name: "inspected", label: "Inspected", color: DEFAULT_COLORS.review, is_terminal: false },
      { name: "signed_off", label: "Signed Off", color: DEFAULT_COLORS.success, is_terminal: false },
      { name: "completed", label: "Completed", color: DEFAULT_COLORS.done, is_terminal: true }
    ]
  },
  finance: {
    workWeekHours: 40,
    positions: [
      { title: "CEO", level: 0 },
      { title: "CFO", level: 0 },
      { title: "Finance Manager", level: 1 },
      { title: "Compliance Lead", level: 1 },
      { title: "Analyst", level: 2 }
    ],
    workflowName: "Finance Ops Workflow",
    workflowStages: [
      { name: "draft", label: "Draft", color: DEFAULT_COLORS.neutral, is_terminal: false },
      { name: "compliance_check", label: "Compliance Check", color: DEFAULT_COLORS.review, is_terminal: false },
      { name: "approved", label: "Approved", color: DEFAULT_COLORS.success, is_terminal: false },
      { name: "executed", label: "Executed", color: DEFAULT_COLORS.progress, is_terminal: false },
      { name: "reported", label: "Reported", color: DEFAULT_COLORS.done, is_terminal: true }
    ]
  },
  retail: {
    workWeekHours: 35,
    positions: [
      { title: "Managing Director", level: 0 },
      { title: "Finance Director", level: 0 },
      { title: "Store Manager", level: 1 },
      { title: "Department Supervisor", level: 1 },
      { title: "Associate", level: 2 }
    ],
    workflowName: "Retail Operations Workflow",
    workflowStages: [
      { name: "assigned", label: "Assigned", color: DEFAULT_COLORS.neutral, is_terminal: false },
      { name: "ordered", label: "Ordered", color: DEFAULT_COLORS.warn, is_terminal: false },
      { name: "received", label: "Received", color: DEFAULT_COLORS.progress, is_terminal: false },
      { name: "processed", label: "Processed", color: DEFAULT_COLORS.review, is_terminal: false },
      { name: "completed", label: "Completed", color: DEFAULT_COLORS.done, is_terminal: true }
    ]
  },
  manufacturing: {
    workWeekHours: 40,
    positions: [
      { title: "Plant Director", level: 0 },
      { title: "Finance Director", level: 0 },
      { title: "Operations Manager", level: 1 },
      { title: "Quality Manager", level: 1 },
      { title: "Line Lead", level: 2 }
    ],
    workflowName: "Manufacturing Workflow",
    workflowStages: [
      { name: "planned", label: "Planned", color: DEFAULT_COLORS.neutral, is_terminal: false },
      { name: "scheduled", label: "Scheduled", color: DEFAULT_COLORS.warn, is_terminal: false },
      { name: "in_progress", label: "In Progress", color: DEFAULT_COLORS.progress, is_terminal: false },
      { name: "quality_check", label: "Quality Check", color: DEFAULT_COLORS.review, is_terminal: false },
      { name: "completed", label: "Completed", color: DEFAULT_COLORS.done, is_terminal: true }
    ]
  },
  education: {
    workWeekHours: 40,
    positions: [
      { title: "Executive Director", level: 0 },
      { title: "Finance Director", level: 0 },
      { title: "Program Manager", level: 1 },
      { title: "Department Head", level: 1 },
      { title: "Coordinator", level: 2 }
    ],
    workflowName: "Education Delivery Workflow",
    workflowStages: [
      { name: "planned", label: "Planned", color: DEFAULT_COLORS.neutral, is_terminal: false },
      { name: "prepared", label: "Prepared", color: DEFAULT_COLORS.warn, is_terminal: false },
      { name: "in_progress", label: "In Progress", color: DEFAULT_COLORS.progress, is_terminal: false },
      { name: "review", label: "Review", color: DEFAULT_COLORS.review, is_terminal: false },
      { name: "completed", label: "Completed", color: DEFAULT_COLORS.done, is_terminal: true }
    ]
  },
  nonprofit: {
    workWeekHours: 40,
    positions: [
      { title: "Executive Director", level: 0 },
      { title: "Finance Director", level: 0 },
      { title: "Program Manager", level: 1 },
      { title: "Operations Manager", level: 1 },
      { title: "Coordinator", level: 2 }
    ],
    workflowName: "Nonprofit Impact Workflow",
    workflowStages: [
      { name: "planned", label: "Planned", color: DEFAULT_COLORS.neutral, is_terminal: false },
      { name: "funded", label: "Funded", color: DEFAULT_COLORS.warn, is_terminal: false },
      { name: "in_progress", label: "In Progress", color: DEFAULT_COLORS.progress, is_terminal: false },
      { name: "review", label: "Review", color: DEFAULT_COLORS.review, is_terminal: false },
      { name: "completed", label: "Completed", color: DEFAULT_COLORS.done, is_terminal: true }
    ]
  },
  hospitality: {
    workWeekHours: 40,
    positions: [
      { title: "General Manager", level: 0 },
      { title: "Finance Director", level: 0 },
      { title: "Operations Manager", level: 1 },
      { title: "Guest Experience Manager", level: 1 },
      { title: "Supervisor", level: 2 }
    ],
    workflowName: "Hospitality Operations Workflow",
    workflowStages: [
      { name: "assigned", label: "Assigned", color: DEFAULT_COLORS.neutral, is_terminal: false },
      { name: "prepared", label: "Prepared", color: DEFAULT_COLORS.warn, is_terminal: false },
      { name: "in_progress", label: "In Progress", color: DEFAULT_COLORS.progress, is_terminal: false },
      { name: "review", label: "Review", color: DEFAULT_COLORS.review, is_terminal: false },
      { name: "completed", label: "Completed", color: DEFAULT_COLORS.done, is_terminal: true }
    ]
  }
};

export function getIndustrySeedConfig(industry: Industry): IndustrySeedConfig {
  return INDUSTRY_CONFIG[industry] ?? INDUSTRY_CONFIG.tech;
}

export async function setupOrgForIndustry(
  fastify: FastifyInstance,
  input: {
    orgId: string;
    industry: Industry;
    companySize: CompanySize;
  }
): Promise<void> {
  const config = getIndustrySeedConfig(input.industry);

  const settingsUpsert = await fastify.supabaseService
    .from("org_settings")
    .upsert(
      {
        org_id: input.orgId,
        industry: input.industry,
        company_size: input.companySize,
        work_week_hours: config.workWeekHours,
        timezone: "UTC"
      },
      { onConflict: "org_id" }
    );

  if (settingsUpsert.error) {
    throw new Error(`Failed to upsert org settings: ${settingsUpsert.error.message}`);
  }

  const positionsUpsert = await fastify.supabaseService
    .from("positions")
    .upsert(
      config.positions.map((position) => ({
        org_id: input.orgId,
        title: position.title,
        level: position.level,
        is_custom: false,
        confirmed: true
      })),
      { onConflict: "org_id,title" }
    );

  if (positionsUpsert.error) {
    throw new Error(`Failed to seed industry positions: ${positionsUpsert.error.message}`);
  }

  const existingDefaultWorkflow = await fastify.supabaseService
    .from("workflow_definitions")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("entity_type", "task")
    .eq("is_default", true)
    .maybeSingle();

  if (existingDefaultWorkflow.error) {
    throw new Error(`Failed to load existing workflow definition: ${existingDefaultWorkflow.error.message}`);
  }

  if (existingDefaultWorkflow.data?.id) {
    const updateWorkflow = await fastify.supabaseService
      .from("workflow_definitions")
      .update({
        name: config.workflowName,
        stages: config.workflowStages
      })
      .eq("id", existingDefaultWorkflow.data.id);

    if (updateWorkflow.error) {
      throw new Error(`Failed to update default workflow: ${updateWorkflow.error.message}`);
    }
  } else {
    const insertWorkflow = await fastify.supabaseService.from("workflow_definitions").insert({
      org_id: input.orgId,
      name: config.workflowName,
      entity_type: "task",
      stages: config.workflowStages,
      is_default: true
    });

    if (insertWorkflow.error) {
      throw new Error(`Failed to create default workflow: ${insertWorkflow.error.message}`);
    }
  }
}
