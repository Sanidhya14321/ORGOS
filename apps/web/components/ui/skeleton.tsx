import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-busy="true" aria-label="Loading" className={cn("skeleton-shimmer rounded-md bg-bg-subtle", className)} />;
}
