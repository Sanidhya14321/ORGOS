"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type PersonNodeData = {
  id: string;
  name: string;
  role: string;
  positionTitle?: string;
  activeTasks?: number;
  slaStatus?: "on_track" | "at_risk" | "breached";
};

export function PersonNode(props: NodeProps) {
  const data = props.data as PersonNodeData;
  const tone = data.slaStatus === "breached" ? "bg-danger" : data.slaStatus === "at_risk" ? "bg-warning" : "bg-success";

  return (
    <div className={`w-[200px] rounded-md border ${props.selected ? "border-accent" : "border-border-strong"} bg-bg-elevated p-3`}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-border-strong" />
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8"><AvatarFallback>{data.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-text-primary">{data.name}</p>
          <p className="truncate text-[11px] text-text-secondary">{data.positionTitle ?? data.role}</p>
        </div>
        <span className={`ml-auto h-2.5 w-2.5 rounded-full ${tone}`} />
      </div>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: 5 }).map((_, idx) => (
          <span key={idx} className={`h-1.5 flex-1 rounded ${idx < Math.min(data.activeTasks ?? 0, 5) ? "bg-accent" : "bg-bg-subtle"}`} />
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-border-strong" />
    </div>
  );
}
