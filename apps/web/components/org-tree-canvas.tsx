"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node } from "reactflow";
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

const roleLevel: Record<TreeUserNode["role"], number> = {
  ceo: 0,
  cfo: 0,
  manager: 1,
  worker: 2
};

const nodeWidth = 260;
const nodeHeight = 120;

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
      const positionTitle = person.position_id ? positionById.get(person.position_id)?.title : undefined;

      return {
        id: person.id,
        position: {
          x: (layoutNode?.x ?? 0) - nodeWidth / 2,
          y: (layoutNode?.y ?? 0) - nodeHeight / 2
        },
        draggable: false,
        data: {
          label: `${person.full_name}\n${positionTitle ?? person.role.toUpperCase()}${person.department ? `\n${person.department}` : ""}`
        },
        style: {
          width: nodeWidth,
          borderRadius: 16,
          border: `2px solid ${getStatusColor(person.status)}`,
          padding: 12,
          whiteSpace: "pre-line",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          fontSize: 13,
          lineHeight: 1.35,
          background: "#fffef9",
          color: "#121826",
          boxShadow: "0 8px 24px rgba(18,24,38,0.12)"
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

  useEffect(() => {
    let cancelled = false;

    async function loadTree() {
      setLoading(true);
      setError(null);

      try {
        const me = await apiFetch<User>("/api/me");
        if (!me.org_id) {
          if (!cancelled) {
            setError("Current user is not linked to an organization yet.");
            router.replace("/complete-profile");
          }
          return;
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
  }, [router]);

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
    return (
      <div className="space-y-3 rounded-2xl bg-[#fff0e6] px-4 py-4 text-sm text-[#9f4f20]">
        <p>{error}</p>
        <Link
          href="/complete-profile"
          className="inline-flex items-center rounded-xl border border-[#e8cdbf] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9f4f20]"
        >
          Complete profile
        </Link>
      </div>
    );
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
