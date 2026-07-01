import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  change: number;
  trend: "up" | "down";
  hint?: string;
}

export function MetricCard({ label, value, change, trend, hint }: MetricCardProps) {
  const positive = (trend === "up" && change >= 0) || (trend === "down" && change < 0);
  // For metrics like churn/resolution, "down" is good.
  const goodDirection =
    (label.toLowerCase().includes("churn") || label.toLowerCase().includes("resolution"))
      ? change < 0
      : change >= 0;

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {value}
          </div>
        </div>
        <div
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
            goodDirection
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {change >= 0 ? (
            <ArrowUpRight className="h-3 w-3" />
          ) : (
            <ArrowDownRight className="h-3 w-3" />
          )}
          {Math.abs(change).toFixed(1)}%
        </div>
      </div>
      {hint && <div className="mt-3 text-xs text-muted-foreground">{hint}</div>}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}
