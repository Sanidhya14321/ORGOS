import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/ui/animated-number";

export function MetricCard({
  label,
  value,
  trend,
  loading,
  tone = "info"
}: {
  label: string;
  value: number;
  trend?: number;
  loading?: boolean;
  tone?: "info" | "success" | "warning" | "danger";
}) {
  if (loading) {
    return (
      <Card className="border-border bg-bg-surface shadow-sm">
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-4 w-16" />
        </CardContent>
      </Card>
    );
  }

  const toneClass = {
    info: "text-info",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger"
  }[tone];

  return (
    <Card className="border-border bg-bg-surface shadow-sm">
      <CardContent className="space-y-2 p-6">
        <p className="text-sm text-text-secondary">{label}</p>
        <p className="text-3xl font-semibold text-text-primary"><AnimatedNumber value={value} /></p>
        {typeof trend === "number" ? (
          <p className={`flex items-center gap-1 text-xs ${toneClass}`}>
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}% vs last month
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
