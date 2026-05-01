"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  X, Download, Mail, Phone, Briefcase, Users, 
  Search, Maximize, ZoomIn, ZoomOut, ChevronRight, Layers 
} from "lucide-react";

/** 
 * TYPES & LAYOUT LOGIC 
 * (Kept identical to your original logic)
 */
type TreeNode = {
  id: string;
  full_name: string;
  role: string;
  reports_to?: string | null;
  position_id?: string | null;
  current_load?: number;
  max_load?: number;
  sla_status?: "on_track" | "at_risk" | "breached";
  department?: string;
  email?: string;
};

type Position = { id: string; title: string; level: number };

interface CircleNode {
  id: string;
  full_name: string;
  role: string;
  email?: string;
  department?: string;
  sla_status: "on_track" | "at_risk" | "breached";
  current_load: number;
  max_load: number;
  x: number;
  y: number;
  radius: number;
  parentId?: string | null;
  children: string[];
  position_title?: string;
}

interface CircleLayout {
  nodes: Map<string, CircleNode>;
  edges: Array<{ fromId: string; toId: string }>;
}

function buildCircleLayout(treeData: TreeNode[] | undefined, positions: Map<string, string>): CircleLayout {
  if (!treeData || treeData.length === 0) return { nodes: new Map(), edges: [] };
  const nodes = new Map<string, CircleNode>();
  const edges: Array<{ fromId: string; toId: string }> = [];
  const childrenMap = new Map<string, string[]>();

  treeData.forEach((node) => {
    nodes.set(node.id, {
      id: node.id,
      full_name: node.full_name,
      role: node.role,
      email: node.email,
      department: node.department,
      sla_status: node.sla_status || "on_track",
      current_load: node.current_load || 0,
      max_load: node.max_load || 10,
      x: 0, y: 0, radius: 45,
      parentId: node.reports_to,
      children: [],
      position_title: node.position_id ? positions.get(node.position_id) : node.role,
    });
    if (node.reports_to) {
      if (!childrenMap.has(node.reports_to)) childrenMap.set(node.reports_to, []);
      childrenMap.get(node.reports_to)!.push(node.id);
      edges.push({ fromId: node.reports_to, toId: node.id });
    }
  });

  childrenMap.forEach((children, parentId) => {
    const parentNode = nodes.get(parentId);
    if (parentNode) parentNode.children = children;
  });

  const getSubtreeWidth = (nodeId: string): number => {
    const node = nodes.get(nodeId);
    if (!node || node.children.length === 0) return 160;
    const childrenWidth = node.children.reduce((sum, childId) => sum + getSubtreeWidth(childId), 0);
    return Math.max(childrenWidth + node.children.length * 30, 160);
  };

  function positionNode(nodeId: string, x: number, y: number): void {
    const node = nodes.get(nodeId);
    if (!node) return;
    node.x = x;
    node.y = y;
    const children = node.children;
    if (children.length === 0) return;
    const verticalGap = 200; 
    const horizontalGap = 40;
    const childY = y + verticalGap;
    const totalChildWidth = children.reduce((sum, childId) => sum + getSubtreeWidth(childId) + horizontalGap, 0) - horizontalGap;
    let currentX = x - totalChildWidth / 2;
    children.forEach((childId) => {
      const subtreeWidth = getSubtreeWidth(childId);
      const childX = currentX + subtreeWidth / 2;
      positionNode(childId, childX, childY);
      currentX += subtreeWidth + horizontalGap;
    });
  }

  const roots = Array.from(nodes.values()).filter((n) => !n.parentId);
  if (roots.length > 0) positionNode(roots[0].id, 600, 100);

  return { nodes, edges };
}

/** 
 * MAIN COMPONENT 
 */
export function OrgTree() {
  const [search, setSearch] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Data fetching
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<{ org_id?: string; role: string }>("/api/me"),
  });

  const treeQuery = useQuery({
    queryKey: ["tree", meQuery.data?.org_id],
    queryFn: () => apiFetch<{ orgId: string; nodes: TreeNode[]; positions: Position[] }>(
      `/api/orgs/${meQuery.data?.org_id}/tree`
    ),
    enabled: Boolean(meQuery.data?.org_id),
  });

  const layout = useMemo(() => {
    const positionsMap = new Map((treeQuery.data?.positions ?? []).map((p) => [p.id, p.title]));
    return buildCircleLayout(treeQuery.data?.nodes, positionsMap);
  }, [treeQuery.data]);

  const selectedNode = selectedNodeId ? layout.nodes.get(selectedNodeId) : null;

  // Interaction Handlers
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(prev => Math.min(Math.max(prev * delta, 0.2), 2));
    }
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
    }
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  if (treeQuery.isLoading) return <Skeleton className="h-[600px] w-full rounded-xl" />;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-4 select-none">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between bg-background/60 backdrop-blur-md p-2 rounded-xl border border-border shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members..."
              className="pl-9 bg-secondary/50 border-none focus-visible:ring-1"
            />
          </div>
          <div className="h-6 w-[1px] bg-border mx-2" />
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">On Track</Badge>
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200">At Risk</Badge>
            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">Breached</Badge>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setZoom(z => z + 0.1)}><ZoomIn className="h-4 w-4"/></Button>
            <Button variant="ghost" size="icon" onClick={() => setZoom(z => z - 0.1)}><ZoomOut className="h-4 w-4"/></Button>
            <Button variant="ghost" size="icon" onClick={resetView}><Maximize className="h-4 w-4"/></Button>
            <Button variant="default" size="sm" className="ml-2 shadow-lg shadow-primary/20">
                <Download className="h-4 w-4 mr-2" /> Export
            </Button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden bg-background rounded-2xl border border-border shadow-inner">
        {/* SVG Canvas */}
        <svg
          ref={svgRef}
          className={`w-full h-full touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onMouseMove={handleMouseMove}
        >
          <g transform={`translate(${offset.x}, ${offset.y}) scale(${zoom})`} style={{ transition: isDragging ? 'none' : 'transform 0.1s ease-out' }}>
            {/* Connection Lines (Orthogonal/Step style) */}
            {layout.edges.map((edge, idx) => {
              const from = layout.nodes.get(edge.fromId);
              const to = layout.nodes.get(edge.toId);
              if (!from || !to) return null;
              
              const midY = from.y + (to.y - from.y) / 2;
              const pathD = `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;

              return (
                <path
                  key={`edge-${idx}`}
                  d={pathD}
                  fill="none"
                  stroke="currentColor"
                  className="text-border"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              );
            })}

            {/* Nodes */}
            {Array.from(layout.nodes.values()).map((node) => {
              const isMatched = !search || node.full_name.toLowerCase().includes(search.toLowerCase());
              const isSelected = selectedNodeId === node.id;
              
              const statusColors = {
                on_track: "border-green-500 bg-green-50",
                at_risk: "border-yellow-500 bg-yellow-50",
                breached: "border-red-500 bg-red-50",
              };

              return (
                <g key={node.id} transform={`translate(${node.x - 80}, ${node.y - 45})`} 
                   onClick={() => setSelectedNodeId(node.id)}
                   className="cursor-pointer transition-opacity duration-300"
                   style={{ opacity: isMatched ? 1 : 0.15 }}>
                  
                  {/* Visual Glow for Selected */}
                  {isSelected && (
                    <rect x="-4" y="-4" width="168" height="98" rx="14" fill="var(--primary)" opacity="0.2" className="animate-pulse" />
                  )}

                  {/* HTML Card inside SVG */}
                  <foreignObject width="160" height="90">
                    <div className={`
                        h-full w-full p-3 rounded-xl border-2 transition-all shadow-sm flex flex-col justify-between
                        ${isSelected ? 'border-primary bg-white ring-4 ring-primary/10' : 'border-border bg-white dark:bg-slate-900'}
                    `}>
                        <div className="flex items-start gap-2">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm
                                ${node.sla_status === 'breached' ? 'bg-red-500' : node.sla_status === 'at_risk' ? 'bg-yellow-500' : 'bg-green-500'}`}>
                                {node.full_name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-[11px] font-bold truncate text-slate-900 dark:text-slate-100">{node.full_name}</p>
                                <p className="text-[9px] text-muted-foreground truncate uppercase tracking-tighter">{node.position_title}</p>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between items-center text-[9px]">
                                <span className="text-muted-foreground">Workload</span>
                                <span className="font-medium">{Math.round((node.current_load/node.max_load)*100)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${node.sla_status === 'breached' ? 'bg-red-500' : 'bg-primary'}`} 
                                     style={{ width: `${(node.current_load/node.max_load)*100}%` }} />
                            </div>
                        </div>
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Floating Detail Panel */}
        {selectedNode && (
          <div className="absolute top-4 right-4 bottom-4 w-80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-border shadow-2xl rounded-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Users className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-slate-100 line-clamp-1">{selectedNode.full_name}</h3>
                        <p className="text-xs text-muted-foreground">ID: {selectedNode.id.slice(0,8)}</p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedNodeId(null)} className="rounded-full">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-primary/80">Department</p>
                        <p className="text-sm font-medium">{selectedNode.department || "N/A"}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-primary/80">Status</p>
                        <Badge variant="outline" className="capitalize">{selectedNode.sla_status.replace('_', ' ')}</Badge>
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Contacts</p>
                    <div className="space-y-2">
                        {selectedNode.email && (
                            <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 text-sm hover:bg-secondary/50 cursor-pointer transition-colors">
                                <Mail className="h-4 w-4 text-primary" />
                                <span className="truncate">{selectedNode.email}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/30 text-sm hover:bg-secondary/50 cursor-pointer">
                            <Phone className="h-4 w-4 text-primary" />
                            <span>+1 (555) 000-0000</span>
                        </div>
                    </div>
                </div>

                {selectedNode.children.length > 0 && (
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Team Members ({selectedNode.children.length})</p>
                        <div className="space-y-2">
                            {selectedNode.children.map(id => {
                                const child = layout.nodes.get(id);
                                return child ? (
                                    <div key={id} onClick={() => setSelectedNodeId(id)} 
                                         className="flex items-center justify-between p-2 rounded-xl border border-transparent hover:border-border hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer group">
                                        <div className="flex items-center gap-3">
                                            <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px]">
                                                {child.full_name[0]}
                                            </div>
                                            <span className="text-xs font-medium">{child.full_name}</span>
                                        </div>
                                        <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                                    </div>
                                ) : null;
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="p-5 border-t border-border grid grid-cols-2 gap-2">
                <Button variant="outline" className="w-full">Message</Button>
                <Button className="w-full shadow-md">View Profile</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}