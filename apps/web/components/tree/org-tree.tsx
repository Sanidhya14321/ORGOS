"use client";

import { useMemo, useState } from "react";
import dagre from "dagre";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonNode } from "@/components/tree/person-node";

const nodeTypes = { person: PersonNode } as const;

type TreeNode = {
  id: string;
  full_name: string;
  role: string;
  reports_to?: string | null;
  position_id?: string | null;
};

type Position = { id: string; title: string; level: number };

function layout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 100, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => g.setNode(n.id, { width: 200, height: 72 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - 100, y: p.y - 36 } };
  });
}

export function OrgTree() {
  const [search, setSearch] = useState("");

  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => apiFetch<{ org_id?: string; role: string }>("/api/me") });

  const treeQuery = useQuery({
    queryKey: ["tree", meQuery.data?.org_id],
    queryFn: () => apiFetch<{ orgId: string; nodes: TreeNode[]; positions: Position[] }>(`/api/orgs/${meQuery.data?.org_id}/tree`),
    enabled: Boolean(meQuery.data?.org_id)
  });

  const graph = useMemo(() => {
    const positionsById = new Map((treeQuery.data?.positions ?? []).map((p) => [p.id, p]));
    const rawNodes = (treeQuery.data?.nodes ?? []).map((node) => ({
      id: node.id,
      type: "person",
      data: {
        id: node.id,
        name: node.full_name,
        role: node.role,
        positionTitle: node.position_id ? positionsById.get(node.position_id)?.title : node.role,
        activeTasks: 2,
        slaStatus: "on_track"
      },
      position: { x: 0, y: 0 }
    })) as Node[];

    const rawEdges = (treeQuery.data?.nodes ?? [])
      .filter((node) => node.reports_to)
      .map((node) => ({
        id: `${node.reports_to}-${node.id}`,
        source: node.reports_to as string,
        target: node.id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#3f3f46" },
        style: { stroke: "#3f3f46", strokeWidth: 1.5 }
      })) as Edge[];

    const laidOut = layout(rawNodes, rawEdges);

    const lower = search.toLowerCase();
    return {
      nodes: laidOut.map((n) => {
        const matched = lower.length === 0 || String((n.data as { name: string }).name).toLowerCase().includes(lower);
        return {
          ...n,
          style: {
            opacity: matched ? 1 : 0.3
          }
        };
      }),
      edges: rawEdges
    };
  }, [search, treeQuery.data]);

  if (treeQuery.isLoading || meQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <div className="space-y-3 rounded-md border border-border bg-bg-surface p-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-[200px]" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" className="max-w-sm border-border bg-bg-subtle" />
      </div>
      <div className="h-[calc(100vh-220px)] rounded-md border border-border bg-bg-base">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes as never}
          fitView
          minZoom={0.4}
          maxZoom={1.5}
        >
          <Background color="#27272a" gap={18} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
