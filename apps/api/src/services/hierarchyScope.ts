import type { FastifyInstance } from "fastify";

export type HierarchyRole = "ceo" | "cfo" | "manager" | "worker";

type OrgUserRow = {
  id: string;
  org_id: string | null;
  role: HierarchyRole;
  position_id: string | null;
  reports_to: string | null;
};

type OrgPositionRow = {
  id: string;
  reports_to_position_id: string | null;
};

type TaskLike = {
  org_id?: string | null;
  assigned_to?: string | null;
  assigned_position_id?: string | null;
  owner_id?: string | null;
  assignees?: unknown;
  watchers?: unknown;
};

export type HierarchyScope = {
  requesterId: string;
  orgId: string;
  role: HierarchyRole;
  positionId: string | null;
  executive: boolean;
  visibleTreePositionIds: Set<string>;
  scopedUserIds: Set<string>;
  descendantUserIds: Set<string>;
  scopedPositionIds: Set<string>;
  allUserIds: Set<string>;
  allPositionIds: Set<string>;
};

type HierarchyDataset = {
  users: OrgUserRow[];
  positions: OrgPositionRow[];
};

function isHierarchyRole(value: unknown): value is HierarchyRole {
  return value === "ceo" || value === "cfo" || value === "manager" || value === "worker";
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function collectDescendantIds(rootId: string | null, childrenByParentId: Map<string, string[]>): Set<string> {
  const descendants = new Set<string>();
  if (!rootId) {
    return descendants;
  }

  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (descendants.has(current)) {
      continue;
    }
    descendants.add(current);
    const children = childrenByParentId.get(current) ?? [];
    for (const childId of children) {
      stack.push(childId);
    }
  }

  return descendants;
}

function collectDirectChildren(rootId: string | null, childrenByParentId: Map<string, string[]>): Set<string> {
  const directChildren = new Set<string>();
  if (!rootId) {
    return directChildren;
  }

  for (const childId of childrenByParentId.get(rootId) ?? []) {
    directChildren.add(childId);
  }

  return directChildren;
}

function buildChildrenByParent<T extends { id: string }>(
  rows: T[],
  getParentId: (row: T) => string | null
): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();

  for (const row of rows) {
    const parentId = getParentId(row);
    if (!parentId) {
      continue;
    }

    const children = childrenByParent.get(parentId) ?? [];
    children.push(row.id);
    childrenByParent.set(parentId, children);
  }

  return childrenByParent;
}

async function loadHierarchyDataset(fastify: FastifyInstance, orgId: string): Promise<HierarchyDataset> {
  const [usersResult, positionsResult] = await Promise.all([
    fastify.supabaseService
      .from("users")
      .select("id, org_id, role, position_id, reports_to")
      .eq("org_id", orgId),
    fastify.supabaseService
      .from("positions")
      .select("id, reports_to_position_id")
      .eq("org_id", orgId)
  ]);

  if (usersResult.error) {
    throw new Error(`Failed to load org users: ${usersResult.error.message}`);
  }

  if (positionsResult.error) {
    throw new Error(`Failed to load org positions: ${positionsResult.error.message}`);
  }

  const users = (usersResult.data ?? [])
    .filter((row): row is typeof row & { id: string; role: HierarchyRole } => isHierarchyRole(row.role))
    .map((row) => ({
      id: String(row.id),
      org_id: (row.org_id as string | null | undefined) ?? null,
      role: row.role,
      position_id: (row.position_id as string | null | undefined) ?? null,
      reports_to: (row.reports_to as string | null | undefined) ?? null
    }));

  const positions = (positionsResult.data ?? []).map((row) => ({
    id: String(row.id),
    reports_to_position_id: (row.reports_to_position_id as string | null | undefined) ?? null
  }));

  return { users, positions };
}

export async function getHierarchyScope(fastify: FastifyInstance, userId: string): Promise<HierarchyScope | null> {
  const requesterResult = await fastify.supabaseService
    .from("users")
    .select("id, org_id, role, position_id, reports_to")
    .eq("id", userId)
    .maybeSingle();

  if (requesterResult.error || !requesterResult.data || !isHierarchyRole(requesterResult.data.role)) {
    return null;
  }

  const orgId = (requesterResult.data.org_id as string | null | undefined) ?? null;
  if (!orgId) {
    return null;
  }

  const role = requesterResult.data.role;
  const positionId = (requesterResult.data.position_id as string | null | undefined) ?? null;
  const executive = role === "ceo" || role === "cfo";

  const { users, positions } = await loadHierarchyDataset(fastify, orgId);
  const allUserIds = new Set(users.map((user) => user.id));
  const allPositionIds = new Set(positions.map((position) => position.id));

  const childrenByPositionId = buildChildrenByParent(positions, (position) => position.reports_to_position_id);
  const childrenByUserId = buildChildrenByParent(users, (user) => user.reports_to);

  const descendantPositionIds = collectDescendantIds(positionId, childrenByPositionId);
  const descendantUserIdsByLine = collectDescendantIds(userId, childrenByUserId);
  const directReportUserIds = collectDirectChildren(userId, childrenByUserId);

  const userIdsByPositionId = new Map<string, string[]>();
  for (const user of users) {
    if (!user.position_id) {
      continue;
    }

    const occupants = userIdsByPositionId.get(user.position_id) ?? [];
    occupants.push(user.id);
    userIdsByPositionId.set(user.position_id, occupants);
  }

  const descendantUserIdsByPosition = new Set<string>();
  for (const scopedPositionId of descendantPositionIds) {
    for (const occupantId of userIdsByPositionId.get(scopedPositionId) ?? []) {
      descendantUserIdsByPosition.add(occupantId);
    }
  }

  const scopedUserIds = executive
    ? new Set(allUserIds)
    : role === "manager"
      ? new Set([userId, ...descendantUserIdsByPosition, ...descendantUserIdsByLine])
      : new Set([userId]);

  const descendantUserIds = executive
    ? new Set([...allUserIds].filter((id) => id !== userId))
    : role === "manager"
      ? new Set([...scopedUserIds].filter((id) => id !== userId))
      : new Set<string>();

  const scopedPositionIds = executive
    ? new Set(allPositionIds)
    : role === "manager"
      ? new Set(
          [
            ...descendantPositionIds,
            ...users
              .filter((user) => scopedUserIds.has(user.id) && user.position_id)
              .map((user) => user.position_id as string)
          ]
        )
      : new Set(
          [
            positionId,
            ...users
              .filter((user) => directReportUserIds.has(user.id) && user.position_id)
              .map((user) => user.position_id as string)
          ].filter((value): value is string => typeof value === "string" && value.length > 0)
        );

  const visibleTreePositionIds = executive
    ? new Set(allPositionIds)
    : role === "manager"
      ? scopedPositionIds
      : new Set(
          [
            positionId,
            ...collectDirectChildren(positionId, childrenByPositionId),
            ...users
              .filter((user) => directReportUserIds.has(user.id) && user.position_id)
              .map((user) => user.position_id as string)
          ].filter((value): value is string => typeof value === "string" && value.length > 0)
        );

  return {
    requesterId: userId,
    orgId,
    role,
    positionId,
    executive,
    visibleTreePositionIds,
    scopedUserIds,
    descendantUserIds,
    scopedPositionIds,
    allUserIds,
    allPositionIds
  };
}

export function canAccessTaskWithHierarchy(task: TaskLike, scope: HierarchyScope): boolean {
  if (task.org_id && task.org_id !== scope.orgId) {
    return false;
  }

  if (scope.executive) {
    return true;
  }

  const assignedTo = typeof task.assigned_to === "string" ? task.assigned_to : null;
  const ownerId = typeof task.owner_id === "string" ? task.owner_id : null;
  const assignedPositionId = typeof task.assigned_position_id === "string" ? task.assigned_position_id : null;
  const assignees = toStringArray(task.assignees);
  const watchers = toStringArray(task.watchers);

  if (assignedTo === scope.requesterId || ownerId === scope.requesterId) {
    return true;
  }

  if (assignees.includes(scope.requesterId) || watchers.includes(scope.requesterId)) {
    return true;
  }

  if (scope.role === "manager") {
    if (assignedTo && scope.scopedUserIds.has(assignedTo)) {
      return true;
    }

    if (ownerId && scope.scopedUserIds.has(ownerId)) {
      return true;
    }

    if (assignedPositionId && scope.scopedPositionIds.has(assignedPositionId)) {
      return true;
    }

    if (assignees.some((assigneeId) => scope.scopedUserIds.has(assigneeId))) {
      return true;
    }

    if (watchers.some((watcherId) => scope.scopedUserIds.has(watcherId))) {
      return true;
    }
  }

  return false;
}

export function getAssignableUserIds(scope: HierarchyScope): Set<string> {
  if (scope.executive) {
    return new Set(scope.allUserIds);
  }

  if (scope.role === "manager") {
    return new Set(scope.descendantUserIds);
  }

  return new Set<string>();
}

export function isUserAssignable(scope: HierarchyScope, assigneeId: string): boolean {
  if (scope.executive) {
    return scope.allUserIds.has(assigneeId) && assigneeId !== scope.requesterId;
  }

  if (scope.role === "manager") {
    return scope.descendantUserIds.has(assigneeId);
  }

  return false;
}
