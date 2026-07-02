import { formatDistanceToNowStrict } from "date-fns";
import { Sparkles } from "lucide-react";
import { useDismissInsight, useInsights } from "@/hooks/use-insights";
import { severityConfig, typeLabel } from "@/lib/insight-severity";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AiInsightsPanel() {
  const { data: insights = [], isLoading } = useInsights("pending");
  const dismiss = useDismissInsight();

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[340px] shrink-0 flex-col border-l border-border bg-card/40 xl:flex">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-sm font-semibold">AI Insights</div>
            <div className="text-[11px] text-muted-foreground">Live anomaly feed</div>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          <p className="p-4 text-center text-xs text-muted-foreground">Loading…</p>
        ) : insights.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            No pending insights right now.
          </p>
        ) : (
          insights.map((insight) => {
            const cfg = severityConfig[insight.severity];
            const Icon = cfg.icon;
            const tag =
              typeof insight.context?.tag === "string"
                ? insight.context.tag
                : typeLabel[insight.type];
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
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(insight.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-foreground">
                      {insight.message}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {tag}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2.5 text-xs text-muted-foreground"
                        disabled={dismiss.isPending}
                        onClick={() => dismiss.mutate(insight.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}
