"use client";

import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node } from "reactflow";
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

const roleLevel: Record<TreeUserNode["role"], number> = {
  ceo: 0,
  cfo: 0,
  manager: 1,
  worker: 2
};

function getStatusColor(status: TreeUserNode["status"] | undefined): string {
  if (status === "active") {
    return "#2a9d8f";
  }
  if (status === "rejected") {
    return "#ff6b35";
  }
  return "#e9c46a";
}

function buildGraph(tree: OrgTreeResponse): { nodes: Node[]; edges: Edge[] } {
  const positionById = new Map(tree.positions.map((position) => [position.id, position]));

  const byLevel = new Map<number, TreeUserNode[]>();
  for (const node of tree.nodes) {
    const positionLevel = node.position_id ? positionById.get(node.position_id)?.level : undefined;
    const level = positionLevel ?? roleLevel[node.role] ?? 2;
    const current = byLevel.get(level) ?? [];
    current.push(node);
    byLevel.set(level, current);
  }

  const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);
  const graphNodes: Node[] = [];

  for (const level of sortedLevels) {
    const row = (byLevel.get(level) ?? []).sort((a, b) => a.full_name.localeCompare(b.full_name));
    const rowWidth = Math.max(1, row.length) * 320;

    row.forEach((person, index) => {
      const x = index * 320 - rowWidth / 2;
      const y = level * 190;
      const positionTitle = person.position_id ? positionById.get(person.position_id)?.title : undefined;

      graphNodes.push({
        id: person.id,
        position: { x, y },
        draggable: false,
        data: {
          label: `${person.full_name}\n${positionTitle ?? person.role.toUpperCase()}${person.department ? `\n${person.department}` : ""}`
        },
        style: {
          width: 240,
          borderRadius: 16,
          border: `2px solid ${getStatusColor(person.status)}`,
          padding: 12,
          whiteSpace: "pre-line",
          fontSize: 13,
          lineHeight: 1.35,
          background: "#fffef9",
          color: "#121826",
          boxShadow: "0 8px 24px rgba(18,24,38,0.12)"
        }
      });
    });
  }

  const validIds = new Set(tree.nodes.map((node) => node.id));
  const graphEdges: Edge[] = tree.nodes
    .filter((node) => node.reports_to && validIds.has(node.reports_to))
    .map((node) => ({
      id: `${node.reports_to}-${node.id}`,
      source: node.reports_to as string,
      target: node.id,
      animated: false,
      type: "smoothstep",
      style: { stroke: "#74809a", strokeWidth: 1.75 }
    }));

  return { nodes: graphNodes, edges: graphEdges };
}

export function OrgTreeCanvas() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tree, setTree] = useState<OrgTreeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTree() {
      setLoading(true);
      setError(null);

      try {
        const me = await apiFetch<User>("/api/me");
        if (!me.org_id) {
          throw new Error("Current user is not linked to an organization yet.");
        }

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
  }, []);

  const graph = useMemo(() => {
    if (!tree) {
      return { nodes: [], edges: [] };
    }
    return buildGraph(tree);
  }, [tree]);

  if (loading) {
    return <p className="text-sm text-[#6b7280]">Loading organization tree...</p>;
  }

  if (error) {
    return <p className="rounded-2xl bg-[#fff0e6] px-4 py-3 text-sm text-[#9f4f20]">{error}</p>;
  }

  if (!tree || tree.nodes.length === 0) {
    return <p className="text-sm text-[#6b7280]">No members found for this organization yet.</p>;
  }

  return (
    <div className="h-[72vh] w-full overflow-hidden rounded-3xl border border-[#ece7dd] bg-[#f8fafc]">
      <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView fitViewOptions={{ padding: 0.28 }}>
        <MiniMap pannable zoomable nodeColor="#94a3b8" />
        <Controls />
        <Background color="#d4dbe7" gap={18} />
      </ReactFlow>
    </div>
  );
}
