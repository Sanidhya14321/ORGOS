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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ZoomIn, ZoomOut, Download } from "lucide-react";

const nodeTypes = { person: PersonNode } as const;

type TreeNode = {
  id: string;
  full_name: string;
  role: string;
  reports_to?: string | null;
  position_id?: string | null;
  current_load?: number;
  max_load?: number;
  sla_status?: "on_track" | "at_risk" | "breached";
};

type Position = { id: string; title: string; level: number };

function layout(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 120, nodesep: 50 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => g.setNode(n.id, { width: 240, height: 140 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - 120, y: p.y - 70 } };
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
        slaStatus: node.sla_status ?? "on_track",
        currentLoad: node.current_load ?? 0,
        maxLoad: node.max_load ?? 10
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
        markerEnd: { type: MarkerType.ArrowClosed, color: "#818cf8" },
        style: { stroke: "#818cf8", strokeWidth: 2 }
      })) as Edge[];

    const laidOut = layout(rawNodes, rawEdges);

    const lower = search.toLowerCase();
    return {
      nodes: laidOut.map((n) => {
        const matched = lower.length === 0 || String((n.data as { name: string }).name).toLowerCase().includes(lower);
        return {
          ...n,
          style: {
            opacity: matched ? 1 : 0.3,
            transition: "opacity 0.2s ease-in-out"
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
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[140px] w-[240px]" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <Input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search people..." 
            className="max-w-sm border-border bg-bg-subtle text-text-primary" 
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="border-border hover:bg-bg-elevated">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Legend */}
      <Card className="border border-border bg-bg-surface p-3">
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-success"></span>
            <span className="text-text-secondary">On Track</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-warning"></span>
            <span className="text-text-secondary">At Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-danger"></span>
            <span className="text-text-secondary">SLA Breached</span>
          </div>
          <div className="ml-auto text-xs text-text-secondary">
            {(treeQuery.data?.nodes ?? []).length} members
          </div>
        </div>
      </Card>

      {/* Tree Container */}
      <div className="relative h-[calc(100vh-300px)] rounded-lg border border-border bg-bg-base overflow-hidden">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes as never}
          fitView
          minZoom={0.4}
          maxZoom={2}
        >
          <Background color="#27272a" gap={18} />
          <Controls showInteractive={true} />
        </ReactFlow>
      </div>
    </div>
  );
}
