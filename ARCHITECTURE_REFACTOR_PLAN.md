# ORGOS Architecture Refactor Plan: Dynamic Organizational Hierarchies

## Current Implementation (Fixed 3-Tier)

### ❌ What's Hardcoded

1. **Roles** (packages/shared-types/src/task.schema.ts):
   ```typescript
   AssignedRoleSchema = z.enum(["ceo", "cfo", "manager", "worker"])
   ```
   → Only 4 hardcoded roles, no flexibility

2. **Depth** (same file):
   ```typescript
   depth: z.union([z.literal(0), z.literal(1), z.literal(2)])
   ```
   → Only 3 levels: 0=Goal, 1=Directive, 2=Subtask

3. **Agent Pipeline** (packages/agent-core/src/agents/):
   - `ceoAgent.ts` - Takes goal, produces directives assigned to CEO/CFO/Manager
   - `managerAgent.ts` - Takes directive, produces tasks assigned to workers
   - `workerAgent.ts` - Takes task, produces execution reports
   - **Problem**: No recursion, agents are hard-coupled to specific roles

4. **Power Assignment** (apps/api/src/plugins/rbac.ts):
   - CEO/CFO → full access
   - Manager → team-level access
   - Worker → own-tasks access
   - **Problem**: Hardcoded permission hierarchy

5. **Task Routing** (apps/api/src/services/assignmentEngine.ts):
   - Assigns based on fixed role → department mappings
   - No support for custom position hierarchies

## Desired Implementation (Dynamic N-Tier)

### ✅ What You Want

A company like:
```
CEO (Level 0)
├── VP Engineering (Level 1)
│   ├── Director Backend (Level 2)
│   │   ├── Staff Engineer (Level 3)
│   │   └── Senior Engineer (Level 3)
│   └── Director Frontend (Level 2)
│       ├── Senior Frontend Dev (Level 3)
│       └── Frontend Dev (Level 3)
├── VP Product (Level 1)
│   └── Product Manager (Level 2)
├── VP Sales (Level 1)
│   ├── Sales Manager (Level 2)
│   │   └── Sales Rep (Level 3)
│   └── Account Manager (Level 3)
└── CFO (Level 1)
    └── Finance Manager (Level 2)
```

**Key Requirements**:
1. **Arbitrary depth** - unlimited hierarchy levels
2. **Custom positions** - not limited to 4 hardcoded roles
3. **Dynamic power assignment** - power determined by org position, not role
4. **Dynamic task assignment** - route to optimal person in hierarchy
5. **Cascading priorities** - priority flows through chain of command
6. **Recursive agent system** - same agent handles any level, not 3 fixed agents

---

## Implementation Strategy

### Phase 1: Schema Refactor (Breaking Changes)

#### 1.1 Create OrgStructure Schema
**New file**: `packages/shared-types/src/org-structure.schema.ts`

```typescript
// Position in the org hierarchy
export const PositionSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  name: z.string(),                    // e.g., "VP Engineering"
  level: z.number().int().min(0),      // 0=CEO, 1=VP, 2=Director, etc.
  parent_position_id: z.string().uuid().nullable(), // Reports to
  
  // Power boundaries
  canCreateGoals: z.boolean(),
  canCreateTasks: z.boolean(),
  canAssignRoles: z.boolean(),         // Can create new positions
  maxDirectReports: z.number().int(),
  maxTaskDepth: z.number().int(),      // Max depth tasks can go
  
  description: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

// User's position(s) in org
export const UserPositionSchema = z.object({
  user_id: z.string().uuid(),
  position_id: z.string().uuid(),
  effective_from: z.string().datetime(),
  effective_to: z.string().datetime().nullable(),
  is_primary: z.boolean()
});

export type Position = z.infer<typeof PositionSchema>;
export type UserPosition = z.infer<typeof UserPositionSchema>;
```

#### 1.2 Remove Hardcoded Roles from Task Schema
**File**: `packages/shared-types/src/task.schema.ts`

```typescript
// OLD (hardcoded):
const AssignedRoleSchema = z.enum(["ceo", "cfo", "manager", "worker"]);
export const TaskSchema = z.object({
  depth: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  assigned_role: AssignedRoleSchema,
  // ...
});

// NEW (dynamic):
export const TaskSchema = z.object({
  depth: z.number().int().min(0),      // Unlimited depth!
  assigned_position_id: z.string().uuid().nullable(),  // Role as position reference
  suggested_position_ids: z.array(z.string().uuid()),  // Multiple candidates
  priority: z.enum(["low", "medium", "high", "critical"]),
  priority_inherited_from: z.string().uuid().nullable(), // Who set this priority
  // ...
});
```

#### 1.3 Create Hierarchical Agent Schema
**New file**: `packages/agent-core/src/agents/hierarchicalAgent.ts`

```typescript
export interface HierarchicalAgentInput {
  task: Task;
  position: Position;                   // Current position in hierarchy
  orgChart: Position[];                 // Full org structure
  parentDirective?: Task;               // Task that spawned this one
  deadline: string;
  rag?: RagSearchClient;
}

export interface HierarchicalAgentOutput {
  action: "decompose" | "execute" | "delegate";
  subtasks?: Task[];                    // If decomposing
  assignTo?: Position;                  // If delegating
  report?: Report;                      // If executing
  confidence: number;
}

export async function hierarchicalAgent(
  input: HierarchicalAgentInput
): Promise<HierarchicalAgentOutput> {
  // Agent decides based on:
  // 1. Task complexity
  // 2. Current position level
  // 3. Available subordinates
  // 4. Deadline pressure
  // 5. Historical success data
  
  if (shouldDelegate(input)) {
    return { action: "delegate", assignTo: findBestSubordinate(input) };
  }
  if (shouldDecompose(input)) {
    return { action: "decompose", subtasks: await decomposeTask(input) };
  }
  return { action: "execute", report: await executeTask(input) };
}
```

### Phase 2: Database Schema Changes

#### 2.1 New Tables
```sql
-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Org structure: Define positions
CREATE TABLE org_positions (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,                 -- "VP Engineering"
  level INT NOT NULL,                 -- Hierarchy level
  parent_position_id UUID REFERENCES org_positions(id),
  
  can_create_goals BOOLEAN DEFAULT FALSE,
  can_create_tasks BOOLEAN DEFAULT FALSE,
  can_assign_roles BOOLEAN DEFAULT FALSE,
  max_direct_reports INT DEFAULT 5,
  max_task_depth INT DEFAULT 3,
  
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, name, level)
);

-- Map users to positions
CREATE TABLE user_org_positions (
  user_id UUID NOT NULL REFERENCES users(id),
  position_id UUID NOT NULL REFERENCES org_positions(id),
  effective_from TIMESTAMP DEFAULT NOW(),
  effective_to TIMESTAMP,
  is_primary BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, position_id)
);
```

#### 2.2 Modify Tasks Table
```sql
-- Replace:
-- assigned_role ENUM ('ceo','cfo','manager','worker')
-- depth INT CHECK (depth IN (0,1,2))

-- With:
ALTER TABLE tasks
  ADD COLUMN assigned_position_id UUID REFERENCES org_positions(id),
  ADD COLUMN suggested_position_ids UUID[] DEFAULT '{}',
  ADD COLUMN depth INT NOT NULL DEFAULT 0,
  ADD COLUMN priority_inherited_from UUID REFERENCES tasks(id);

-- Drop old constraint
ALTER TABLE tasks DROP CONSTRAINT tasks_depth_check;
```

### Phase 3: Agent System Refactor

#### 3.1 Remove Fixed-Tier Agents
Delete:
- `ceoAgent.ts` (only handles CEO)
- `managerAgent.ts` (only handles Manager)

#### 3.2 Create Universal Hierarchical Agent
**New file**: `packages/agent-core/src/agents/hierarchicalAgent.ts`

**Key Logic**:
```typescript
async function hierarchicalAgent(input: HierarchicalAgentInput) {
  const { task, position, orgChart } = input;
  
  // Determine if current position should handle this or delegate down
  const subordinates = findSubordinates(position, orgChart);
  
  if (task.depth >= position.maxTaskDepth) {
    // Must delegate down - task too deep for this level
    const ideal = findBestCandidate(task, subordinates);
    return { action: "delegate", assignTo: ideal };
  }
  
  if (isComplex(task) && subordinates.length > 0) {
    // Decompose into subtasks for subordinates
    const subtasks = await generateSubtasks(task, subordinates);
    return { action: "decompose", subtasks };
  }
  
  // Execute at this level
  const report = await gatherEvidenceAndExecute(task);
  return { action: "execute", report };
}
```

#### 3.3 Recursive Task Processing
```typescript
// Queue job that works at ANY level
async function processTaskAtPosition(task: Task, position: Position) {
  const agentResult = await hierarchicalAgent({
    task,
    position,
    orgChart: await fetchOrgChart(task.org_id),
    // ...
  });
  
  switch (agentResult.action) {
    case "decompose":
      // Create subtasks, queue them for subordinates
      for (const subtask of agentResult.subtasks) {
        const subordinate = agentResult.assignTo;
        await queueTaskForPosition(subtask, subordinate);
      }
      break;
    
    case "delegate":
      // Route to subordinate
      await queueTaskForPosition(task, agentResult.assignTo);
      break;
    
    case "execute":
      // Record result
      await saveReport(agentResult.report);
      break;
  }
}
```

### Phase 4: RBAC & Power Assignment

#### 4.1 Dynamic Permission System
**File**: `apps/api/src/lib/powerSystem.ts`

```typescript
// Determine what a user can do based on their position(s)
async function getUserPowers(userId: string): Promise<Powers> {
  const positions = await getUserPositions(userId);
  
  return {
    canCreateGoals: positions.some(p => p.canCreateGoals),
    canCreateTasks: positions.some(p => p.canCreateTasks),
    canAssignRoles: positions.some(p => p.canAssignRoles),
    
    // Can delegate to subordinates
    canDelegateTo: getSubordinates(positions),
    
    // Can see org units they manage
    visibleOrgUnits: getVisibleOrgUnits(positions),
    
    // Can approve work from direct reports
    canApproveFrom: getDirectReports(positions)
  };
}

// Check if user can assign task to person
async function canAssignTo(
  fromUser: string,
  toUser: string,
  task: Task
): Promise<boolean> {
  // Only direct superiors can assign work down
  return isDirectSuperior(fromUser, toUser);
}
```

#### 4.2 Task Assignment Engine (Dynamic)
**File**: `apps/api/src/services/dynamicAssignmentEngine.ts`

```typescript
async function findBestCandidate(
  task: Task,
  requiredPosition: Position,
  availablePeople: User[]
): Promise<User | null> {
  // Factor in:
  // 1. Required position type (exact match or compatible)
  // 2. Current workload
  // 3. Skills match
  // 4. Historical success on similar tasks
  // 5. Deadline pressure
  // 6. Team capacity
  
  const scored = availablePeople.map(person => ({
    person,
    score: await calculateAssignmentScore(person, task)
  }));
  
  return scored.sort((a, b) => b.score - a.score)[0]?.person ?? null;
}
```

### Phase 5: API & Frontend Updates

#### 5.1 New Endpoints for Org Management
```
POST /orgs/:orgId/positions           # Create position
GET  /orgs/:orgId/structure          # Get org chart
PATCH /orgs/:orgId/positions/:posId  # Update position
DELETE /orgs/:orgId/positions/:posId # Remove position

POST /users/:userId/positions        # Assign user to position
GET  /users/:userId/positions        # Get user's positions
```

#### 5.2 Frontend: Org Chart Visualization
**New component**: `apps/web/components/org/org-chart-builder.tsx`

- Drag-and-drop org structure editor
- Visual hierarchy with collapsible teams
- Position management (create/edit/delete)
- User assignment to positions
- Power delegation visualization

---

## Migration Path (Backward Compatibility)

### Phase 1: Dual System (Current + New)
1. Keep existing `assigned_role` enum
2. Add new `assigned_position_id` field (optional)
3. If `assigned_position_id` is null, fall back to `assigned_role`
4. Gradually migrate tasks

### Phase 2: Data Migration
```typescript
// Auto-create positions for legacy roles
const legacyPositions = {
  "ceo": createPosition({ name: "CEO", level: 0, canCreateGoals: true }),
  "cfo": createPosition({ name: "CFO", level: 0, canCreateGoals: true }),
  "manager": createPosition({ name: "Manager", level: 1, canCreateTasks: true }),
  "worker": createPosition({ name: "Worker", level: 2 })
};

// Map all tasks from assigned_role → assigned_position_id
for (const task of allTasks) {
  task.assigned_position_id = legacyPositions[task.assigned_role].id;
}
```

### Phase 3: Deprecate & Remove
Once all tasks migrated:
1. Mark `assigned_role` as deprecated
2. Remove from Task schema
3. Full migration to position-based system

---

## Key Differences: Before vs After

| Aspect | Current (Fixed) | Refactored (Dynamic) |
|--------|---|---|
| **Org Structure** | 4 hardcoded roles | Unlimited positions, arbitrary depth |
| **Power** | Fixed per role | Configured per position, hierarchical |
| **Task Decomposition** | CEO→Manager→Worker (3 agents) | Recursive at any level (1 agent) |
| **Task Routing** | Role-based | Position + skills + capacity based |
| **Hierarchy** | 3 fixed tiers | N unlimited tiers |
| **Priority Flow** | Fixed per role | Inherited through chain of command |
| **Company Size** | ~50 people max | 10,000+ person orgs |
| **Delegation** | CEO only → Manager → Worker | Anyone can delegate down |

---

## Effort Estimate

| Phase | Effort | Risk |
|-------|--------|------|
| Schema refactor | 2-3 days | Medium (breaking changes) |
| Agent system | 3-4 days | High (core logic change) |
| Database migration | 1-2 days | Medium (data mapping) |
| API/Frontend | 2-3 days | Low (new endpoints) |
| Testing | 2-3 days | Medium (distributed system) |
| **Total** | **10-15 days** | **Medium** |

---

## Questions to Answer Before Starting

1. **Should users have multiple positions?** (e.g., Acting Manager + IC)
   - Affects: power calculation, visibility, reporting
   
2. **Can positions be temporary?** (e.g., maternity cover, project lead)
   - Answer affects: effective_from/to timestamps, permission checks
   
3. **How deep should orgs go?** (affects max_task_depth)
   - Typical: CEO → VP → Director → Manager → IC (5 levels)
   - Complex: Could be 7-8 levels in large enterprises
   
4. **Can users skip levels when delegating?** (CEO → IC, skipping VP)
   - Security implications if yes
   
5. **Should power be cumulative?** (VP + Director powers = super-VP?)
   - Or should highest power level take precedence?
