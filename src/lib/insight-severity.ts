import { AlertTriangle, Activity, Lightbulb, Info, type LucideIcon } from "lucide-react";
import type { InsightSeverity, InsightType } from "@/lib/api";

export const severityConfig: Record<
  InsightSeverity,
  { icon: LucideIcon; className: string; label: string }
> = {
  critical: {
    icon: AlertTriangle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
    label: "Critical",
  },
  high: {
    icon: Activity,
    className: "bg-warning/10 text-warning border-warning/20",
    label: "High",
  },
  medium: {
    icon: Info,
    className: "bg-info/10 text-info border-info/20",
    label: "Medium",
  },
  low: {
    icon: Lightbulb,
    className: "bg-primary/10 text-primary border-primary/20",
    label: "Low",
  },
};

export const typeLabel: Record<InsightType, string> = {
  anomaly: "Anomaly",
  recommendation: "Recommendation",
};
