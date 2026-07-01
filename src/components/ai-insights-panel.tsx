import { AlertTriangle, Lightbulb, Info, Activity, Sparkles } from "lucide-react";
import { aiInsights } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
    label: "Critical",
  },
  warning: {
    icon: Activity,
    className: "bg-warning/10 text-warning border-warning/20",
    label: "Warning",
  },
  recommendation: {
    icon: Lightbulb,
    className: "bg-primary/10 text-primary border-primary/20",
    label: "Recommendation",
  },
  info: { icon: Info, className: "bg-info/10 text-info border-info/20", label: "Info" },
} as const;

export function AiInsightsPanel() {
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[340px] shrink-0 flex-col border-l border-border bg-card/40 xl:flex">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-sm font-semibold">AI Insights</div>
            <div className="text-[11px] text-muted-foreground">
              Live anomaly feed · updated 12s ago
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {aiInsights.map((insight) => {
          const cfg = severityConfig[insight.severity];
          const Icon = cfg.icon;
          return (
            <article
              key={insight.id}
              className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-md border",
                    cfg.className,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        cfg.className,
                      )}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{insight.time}</span>
                  </div>
                  <h4 className="mt-2 text-sm font-semibold leading-snug text-foreground">
                    {insight.title}
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {insight.body}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs">
                      Investigate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-xs text-muted-foreground"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="border-t border-border p-4">
        <Button className="w-full" size="sm">
          View all insights
        </Button>
      </div>
    </aside>
  );
}
