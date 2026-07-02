import { formatDistanceToNowStrict } from "date-fns";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDismissInsight, useInsights } from "@/hooks/use-insights";
import { severityConfig } from "@/lib/insight-severity";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const { data: insights = [] } = useInsights("pending");
  const dismiss = useDismissInsight();
  const count = insights.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <span className="text-xs text-muted-foreground">{count} pending</span>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {count === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              You're all caught up.
            </p>
          ) : (
            insights.map((insight) => {
              const cfg = severityConfig[insight.severity];
              const Icon = cfg.icon;
              return (
                <div
                  key={insight.id}
                  className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-0"
                >
                  <div
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-md border",
                      cfg.className,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-foreground">{insight.message}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(insight.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px] text-muted-foreground"
                        disabled={dismiss.isPending}
                        onClick={() => dismiss.mutate(insight.id)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
