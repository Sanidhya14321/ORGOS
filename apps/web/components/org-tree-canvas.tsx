"use client";

import { useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactFlow, { Background, Controls, MiniMap, addEdge, type Connection, type Edge, type Node } from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";
import { apiFetch } from "@/lib/api";
import type { User } from "@/lib/models";

type TreeUserNode = {
  id: string;
  full_name: string;
  email?: string;
  role: "ceo" | "cfo" | "manager" | "worker";
  status?: "pending" | "active" | "rejected";
  department?: string | null;
  position_id?: string | null;
  reports_to?: string | null;
};

type TreePosition = {
  id: string;
  title: string;
  level: number;
};

type OrgTreeResponse = {
  orgId: string;
  nodes: TreeUserNode[];
  positions: TreePosition[];
};

type ConnectionMode = "reporting" | "department" | "hybrid";

const roleLevel: Record<TreeUserNode["role"], number> = {
  ceo: 0,
  cfo: 0,
  manager: 1,
  worker: 2
};

const nodeWidth = 260;
const nodeHeight = 120;

function normalizeDepartment(value: string | null | undefined): string {
  const cleaned = (value ?? "").trim();
  return cleaned.length > 0 ? cleaned : "Unassigned";
}

function getStatusColor(status: TreeUserNode["status"] | undefined): string {
  if (status === "active") {
    return "#22c55e";
  }
  if (status === "rejected") {
    return "#ef4444";
  }
  return "#f59e0b";
}

function buildGraph(tree: OrgTreeResponse, mode: ConnectionMode): { nodes: Node[]; edges: Edge[] } {
  const positionById = new Map(tree.positions.map((position) => [position.id, position]));
  const validIds = new Set(tree.nodes.map((node) => node.id));
  const reportingEdges: Edge[] = tree.nodes
    .filter((node) => node.reports_to && validIds.has(node.reports_to))
    .map((node) => ({
      id: `reports:${node.reports_to}-${node.id}`,
      source: node.reports_to as string,
      target: node.id,
      animated: false,
      type: "smoothstep",
      style: { stroke: "#a1a1aa", strokeWidth: 1.75 },
      label: mode === "hybrid" ? "reports to" : undefined,
      labelStyle: mode === "hybrid" ? { fill: "#a1a1aa", fontSize: 10 } : undefined
    }));

  const departmentGroups = new Map<string, TreeUserNode[]>();
  for (const member of tree.nodes) {
    const departmentKey = normalizeDepartment(member.department);
    const list = departmentGroups.get(departmentKey) ?? [];
    list.push(member);
    departmentGroups.set(departmentKey, list);
  }

  const departmentEdges: Edge[] = [];
  for (const [departmentName, members] of departmentGroups) {
    if (members.length <= 1) {
      continue;
    }

    const sorted = members.slice().sort((a, b) => {
      const levelA = (a.position_id ? positionById.get(a.position_id)?.level : undefined) ?? roleLevel[a.role] ?? 2;
      const levelB = (b.position_id ? positionById.get(b.position_id)?.level : undefined) ?? roleLevel[b.role] ?? 2;
      if (levelA !== levelB) {
        return levelA - levelB;
      }
      return a.full_name.localeCompare(b.full_name);
    });

    const anchor = sorted[0];
    for (let index = 1; index < sorted.length; index += 1) {
      const member = sorted[index];
      departmentEdges.push({
        id: `department:${departmentName}:${anchor.id}-${member.id}`,
        source: anchor.id,
        target: member.id,
        animated: false,
        type: "smoothstep",
        style: { stroke: "#38bdf8", strokeWidth: 1.25, strokeDasharray: "5 4" },
        label: mode === "department" ? departmentName : "department",
        labelStyle: { fill: "#38bdf8", fontSize: 10 }
      });
    }
  }

  const graphEdges: Edge[] =
    mode === "reporting"
      ? reportingEdges
      : mode === "department"
        ? departmentEdges
        : [...reportingEdges, ...departmentEdges];

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "TB", ranksep: 95, nodesep: 52, marginx: 20, marginy: 20 });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of tree.nodes) {
    graph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }

  for (const edge of graphEdges) {
    graph.setEdge(edge.source, edge.target);
  }

  // For disconnected roots, create soft edges by role level to keep top-down ordering deterministic.
  const roots = tree.nodes
    .filter((node) => !node.reports_to || !validIds.has(node.reports_to))
    .sort((a, b) => {
      const levelA = (a.position_id ? positionById.get(a.position_id)?.level : undefined) ?? roleLevel[a.role] ?? 2;
      const levelB = (b.position_id ? positionById.get(b.position_id)?.level : undefined) ?? roleLevel[b.role] ?? 2;
      if (levelA !== levelB) {
        return levelA - levelB;
      }
      return a.full_name.localeCompare(b.full_name);
    });

  for (let index = 1; index < roots.length; index += 1) {
    graph.setEdge(roots[index - 1].id, roots[index].id, { minlen: 1, weight: 0.1 });
  }

  dagre.layout(graph);

  const graphNodes: Node[] = tree.nodes
    .slice()
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((person) => {
      const layoutNode = graph.node(person.id) as { x: number; y: number } | undefined;
      const positionInfo = person.position_id ? positionById.get(person.position_id) : undefined;
      const positionTitle = positionInfo?.title;
      const positionLevel = positionInfo?.level;
      const department = normalizeDepartment(person.department);

      return {
        id: person.id,
        position: {
          x: (layoutNode?.x ?? 0) - nodeWidth / 2,
          y: (layoutNode?.y ?? 0) - nodeHeight / 2
        },
        draggable: true,
        data: {
          label: `${person.full_name}\n${positionTitle ?? person.role.toUpperCase()}${positionLevel !== undefined ? ` · L${positionLevel}` : ""}\n${department}`
        },
        style: {
          width: nodeWidth,
          borderRadius: 18,
          border: `1px solid ${getStatusColor(person.status)}`,
          padding: 12,
          whiteSpace: "pre-line",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          fontSize: 13,
          lineHeight: 1.35,
          background: "#18181b",
          color: "#fafafa",
          boxShadow: "0 8px 24px rgba(0,0,0,0.26)"
        }
      } as Node;
    });

  return { nodes: graphNodes, edges: graphEdges };
}

export function OrgTreeCanvas() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<OrgTreeResponse | null>(null);
  const [canEditTree, setCanEditTree] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("hybrid");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [draftRole, setDraftRole] = useState<TreeUserNode["role"]>("worker");
  const [draftPositionId, setDraftPositionId] = useState<string>("");
  const [draftDepartment, setDraftDepartment] = useState("");
  const [draftReportsTo, setDraftReportsTo] = useState("");
  const [savingNode, setSavingNode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTree() {
      setLoading(true);
      setError(null);

      try {
        const me = await apiFetch<User>("/api/me");
        setCanEditTree(me.role === "ceo" || me.role === "cfo");
        if (!me.org_id) {
          if (!cancelled) {
            setError("Current user is not linked to an organization yet.");
            router.replace("/pending");
          }
          return;
        }

        setOrgId(me.org_id);

        const response = await apiFetch<OrgTreeResponse>(`/api/orgs/${me.org_id}/tree`);
        if (!cancelled) {
          setTree(response);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load organization tree");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTree();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const filteredTree = useMemo(() => {
    if (!tree) {
      return null;
    }

    if (departmentFilter === "all") {
      return tree;
    }

    const filteredNodes = tree.nodes.filter((node) => normalizeDepartment(node.department) === departmentFilter);
    return {
      ...tree,
      nodes: filteredNodes
    };
  }, [departmentFilter, tree]);

  const departments = useMemo(() => {
    if (!tree) {
      return [] as string[];
    }

    return Array.from(new Set(tree.nodes.map((node) => normalizeDepartment(node.department)))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [tree]);

  const graph = useMemo(() => {
    if (!filteredTree) {
      return { nodes: [], edges: [] };
    }
    return buildGraph(filteredTree, connectionMode);
  }, [connectionMode, filteredTree]);

  const selectedNode = useMemo(() => {
    if (!tree || !selectedNodeId) {
      return null;
    }
    return tree.nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [selectedNodeId, tree]);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }
    setDraftRole(selectedNode.role);
    setDraftPositionId(selectedNode.position_id ?? "");
    setDraftDepartment(selectedNode.department ?? "");
    setDraftReportsTo(selectedNode.reports_to ?? "");
  }, [selectedNode]);

  async function refreshTree() {
    if (!orgId) {
      return;
    }
    const response = await apiFetch<OrgTreeResponse>(`/api/orgs/${orgId}/tree`);
    setTree(response);
  }

  function patchLocalMember(memberId: string, patch: Partial<TreeUserNode>) {
    setTree((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        nodes: current.nodes.map((member) => (member.id === memberId ? { ...member, ...patch } : member))
      };
    });
  }

  async function onNodeDragStop(_: ReactMouseEvent, node: Node) {
    if (!canEditTree || !tree) {
      return;
    }

    const candidates = graph.nodes.filter((candidate) => candidate.id !== node.id);
    const draggedCenter = {
      x: node.position.x + nodeWidth / 2,
      y: node.position.y + nodeHeight / 2
    };

    let nearest: Node | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      const candidateCenter = {
        x: candidate.position.x + nodeWidth / 2,
        y: candidate.position.y + nodeHeight / 2
      };
      const distance = Math.hypot(candidateCenter.x - draggedCenter.x, candidateCenter.y - draggedCenter.y);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }

    if (!nearest || nearestDistance > 180) {
      return;
    }

    try {
      await apiFetch(`/api/orgs/members/${node.id}/structure`, {
        method: "PATCH",
        body: JSON.stringify({ reportsTo: nearest.id })
      });
      patchLocalMember(node.id, { reports_to: nearest.id });
    } catch (dragError) {
      setError(dragError instanceof Error ? dragError.message : "Unable to update reporting line");
      await refreshTree();
    }
  }

  async function onConnect(connection: Connection) {
    if (!canEditTree || !connection.source || !connection.target || connection.source === connection.target) {
      return;
    }

    try {
      addEdge(connection, graph.edges);
      await apiFetch(`/api/orgs/members/${connection.target}/structure`, {
        method: "PATCH",
        body: JSON.stringify({ reportsTo: connection.source })
      });
      patchLocalMember(connection.target, { reports_to: connection.source });
      setConnectionMode("hybrid");
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to connect members in org tree");
      await refreshTree();
    }
  }

  async function onEdgeDoubleClick(_: ReactMouseEvent, edge: Edge) {
    if (!canEditTree) {
      return;
    }

    if (!edge.id.startsWith("reports:")) {
      return;
    }

    try {
      await apiFetch(`/api/orgs/members/${edge.target}/structure`, {
        method: "PATCH",
        body: JSON.stringify({ reportsTo: null })
      });
      patchLocalMember(edge.target, { reports_to: null });
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove reporting line");
      await refreshTree();
    }
  }

  async function saveSelectedNode() {
    if (!selectedNode || !canEditTree) {
      return;
    }

    setSavingNode(true);
    setError(null);

    try {
      await apiFetch(`/api/orgs/members/${selectedNode.id}/structure`, {
        method: "PATCH",
        body: JSON.stringify({
          role: draftRole,
          positionId: draftPositionId || null,
          department: draftDepartment.trim() || null,
          reportsTo: draftReportsTo || null
        })
      });
      patchLocalMember(selectedNode.id, {
        role: draftRole,
        position_id: draftPositionId || null,
        department: draftDepartment.trim() || null,
        reports_to: draftReportsTo || null
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save member changes from tree");
      await refreshTree();
    } finally {
      setSavingNode(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">Loading organization tree...</p>;
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-4 text-sm text-[var(--warning)]">
        <p>{error}</p>
        <Link
          href="/dashboard/ceo"
          className="inline-flex items-center rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--warning)]"
        >
          Open admin dashboard
        </Link>
      </div>
    );
  }

  if (!tree || tree.nodes.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No members found for this organization yet.</p>;
  }

  const treeData = tree;

  function suggestDepartmentLead() {
    if (!selectedNode) {
      return;
    }

    const targetDepartment = normalizeDepartment(draftDepartment || selectedNode.department);
    const candidate = treeData.nodes
      .filter((member) => member.id !== selectedNode.id && normalizeDepartment(member.department) === targetDepartment)
      .sort((a, b) => {
        const levelA = roleLevel[a.role] ?? 2;
        const levelB = roleLevel[b.role] ?? 2;
        if (levelA !== levelB) {
          return levelA - levelB;
        }
        return a.full_name.localeCompare(b.full_name);
      })[0];

    if (candidate) {
      setDraftReportsTo(candidate.id);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4 md:grid-cols-3">
        <label className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Connection mode</p>
          <select
            className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--warning)]"
            value={connectionMode}
            onChange={(event) => setConnectionMode(event.target.value as ConnectionMode)}
          >
            <option value="reporting">Reporting lines</option>
            <option value="department">Department-linked</option>
            <option value="hybrid">Hybrid view</option>
          </select>
        </label>

        <label className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]">Filter department</p>
          <select
            className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--warning)]"
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
          >
            <option value="all">All departments</option>
            {departments.map((departmentName) => (
              <option key={departmentName} value={departmentName}>
                {departmentName}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <p className="font-semibold uppercase tracking-[0.2em]">Guide</p>
          <p className="mt-1">
            <span className="text-[var(--text-primary)]">Gray</span> edges are reporting lines. <span className="text-[var(--info)]">Cyan dashed</span> edges connect members inside the same department. Double-click a gray edge to detach.
          </p>
        </div>
      </div>

      <div className="h-[68vh] w-full overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-subtle)]">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          fitView
          fitViewOptions={{ padding: 0.28 }}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          nodesDraggable={canEditTree}
          nodesConnectable={canEditTree}
          edgesFocusable={canEditTree}
        >
          <MiniMap pannable zoomable nodeColor={(node) => (node.id === selectedNodeId ? "#38bdf8" : "#f59e0b")} />
          <Controls />
          <Background color="#3f3f46" gap={18} />
        </ReactFlow>
      </div>

      {canEditTree && selectedNode ? (
        <div className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-secondary)]">Tree member editor</p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{selectedNode.full_name}</h3>
          <p className="text-xs text-[var(--text-secondary)]">{selectedNode.email ?? "No email on profile"}</p>

          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <select
              className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--warning)]"
              value={draftRole}
              onChange={(event) => setDraftRole(event.target.value as TreeUserNode["role"])}
            >
              <option value="ceo">CEO</option>
              <option value="cfo">CFO</option>
              <option value="manager">Manager</option>
              <option value="worker">Worker</option>
            </select>
            <select
              className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--warning)]"
              value={draftPositionId}
              onChange={(event) => setDraftPositionId(event.target.value)}
            >
              <option value="">Auto position</option>
              {treeData.positions.map((position) => (
                <option key={position.id} value={position.id}>{position.title} (L{position.level})</option>
              ))}
            </select>
            <input
              className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--warning)]"
              value={draftDepartment}
              onChange={(event) => setDraftDepartment(event.target.value)}
              placeholder="Department"
            />
            <select
              className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--warning)]"
              value={draftReportsTo}
              onChange={(event) => setDraftReportsTo(event.target.value)}
            >
              <option value="">No manager (root)</option>
              {treeData.nodes
                .filter((member) => member.id !== selectedNode.id)
                .sort((a, b) => a.full_name.localeCompare(b.full_name))
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} ({member.role.toUpperCase()})
                  </option>
                ))}
            </select>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void saveSelectedNode()}
              disabled={savingNode}
              className="rounded-2xl bg-[var(--warning)] px-4 py-2 text-sm font-semibold text-[var(--bg-base)] disabled:opacity-60"
            >
              {savingNode ? "Saving..." : "Save from tree"}
            </button>
            <button
              type="button"
              onClick={suggestDepartmentLead}
              className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-4 py-2 text-sm font-semibold text-[var(--info)]"
            >
              Suggest dept lead
            </button>
            <button
              type="button"
              onClick={() => setDraftReportsTo("")}
              className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
            >
              Clear manager
            </button>
            <button
              type="button"
              onClick={() => setSelectedNodeId(null)}
              className="rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
            >
              Clear selection
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
