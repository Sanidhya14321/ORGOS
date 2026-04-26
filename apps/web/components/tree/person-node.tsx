"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MoreVertical } from "lucide-react";
import { useState } from "react";

type PersonNodeData = {
  id: string;
  name: string;
  role: string;
  positionTitle?: string;
  activeTasks?: number;
  slaStatus?: "on_track" | "at_risk" | "breached";
  currentLoad?: number;
  maxLoad?: number;
};

export function PersonNode(props: NodeProps) {
  const data = props.data as PersonNodeData;
  const [showActions, setShowActions] = useState(false);
  
  const slaStatus = data.slaStatus ?? "on_track";
  const slaColors = {
    on_track: "bg-success-subtle border-success text-success",
    at_risk: "bg-warning-subtle border-warning text-warning",
    breached: "bg-danger-subtle border-danger text-danger",
  };

  const loadPercentage = data.currentLoad && data.maxLoad ? (data.currentLoad / data.maxLoad) * 100 : 0;
  const loadColor = loadPercentage > 80 ? "bg-danger" : loadPercentage > 60 ? "bg-warning" : "bg-success";

  const statusLabel = {
    on_track: "On Track",
    at_risk: "At Risk",
    breached: "SLA Breached",
  };

  return (
    <div 
      className={`w-[240px] rounded-lg border-2 transition-all ${
        props.selected 
          ? "border-accent bg-bg-elevated shadow-lg shadow-accent/20" 
          : "border-border bg-bg-surface hover:border-accent hover:shadow-md"
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !bg-accent" />
      
      {/* Header */}
      <div className="border-b border-border p-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarFallback className="bg-accent text-white font-bold">
                {data.name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-text-primary">{data.name}</p>
              <p className="truncate text-[11px] text-text-secondary">{data.positionTitle ?? data.role}</p>
            </div>
          </div>
          {showActions && (
            <button className="flex-shrink-0 rounded hover:bg-bg-elevated p-1 transition-colors">
              <MoreVertical className="h-4 w-4 text-text-secondary" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-2 p-3">
        {/* SLA Status Badge */}
        <Badge className={`${slaColors[slaStatus]} border text-xs font-medium`}>
          {statusLabel[slaStatus]}
        </Badge>

        {/* Task Load Indicator */}
        {data.currentLoad !== undefined && data.maxLoad !== undefined && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-text-secondary">Load</span>
              <span className="font-semibold text-text-primary">
                {data.currentLoad}/{data.maxLoad}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-bg-subtle overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all ${loadColor}`}
                style={{ width: `${Math.min(loadPercentage, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Active Tasks Bar */}
        {data.activeTasks !== undefined && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-text-secondary">Tasks:</span>
            <div className="flex gap-1 flex-1">
              {Array.from({ length: 5 }).map((_, idx) => (
                <span 
                  key={idx} 
                  className={`flex-1 h-1.5 rounded-sm transition-colors ${
                    idx < Math.min(data.activeTasks ?? 0, 5) 
                      ? "bg-accent" 
                      : "bg-bg-subtle"
                  }`} 
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !bg-accent" />
    </div>
  );
}
