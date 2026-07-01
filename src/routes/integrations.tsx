import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, RefreshCw, AlertCircle, Search, Plus, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useSimulatedLoading } from "@/hooks/use-simulated-loading";
import { integrations, type IntegrationStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integration Hub — Nexus BI" },
      {
        name: "description",
        content: "Manage third-party integrations, sync status, and event throughput.",
      },
    ],
  }),
  component: IntegrationsPage,
});

const statusMeta: Record<
  IntegrationStatus,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  connected: {
    label: "Connected",
    className: "bg-success/10 text-success border-success/20",
    icon: CheckCircle2,
  },
  syncing: { label: "Syncing", className: "bg-info/10 text-info border-info/20", icon: RefreshCw },
  error: {
    label: "Error",
    className: "bg-destructive/10 text-destructive border-destructive/20",
    icon: AlertCircle,
  },
};

function StatusBadge({ status }: { status: IntegrationStatus }) {
  const m = statusMeta[status];
  const Icon = m.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        m.className,
      )}
    >
      <Icon className={cn("h-3 w-3", status === "syncing" && "animate-spin")} />
      {m.label}
    </span>
  );
}

function IntegrationsPage() {
  const loading = useSimulatedLoading(500);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(integrations.map((i) => [i.name, i.status !== "error"])),
  );

  const counts = {
    connected: integrations.filter((i) => i.status === "connected").length,
    syncing: integrations.filter((i) => i.status === "syncing").length,
    error: integrations.filter((i) => i.status === "error").length,
  };

  return (
    <div>
      <PageHeader
        eyebrow="Data & APIs"
        title="Integration Hub"
        description="Third-party systems piping data into your workflows and BI models."
        actions={
          <Button size="sm" className="h-9">
            <Plus className="mr-2 h-3.5 w-3.5" /> Add integration
          </Button>
        }
      />

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total" value={integrations.length.toString()} />
          <StatCard label="Connected" value={counts.connected.toString()} tone="success" />
          <StatCard label="Syncing" value={counts.syncing.toString()} tone="info" />
          <StatCard label="Errors" value={counts.error.toString()} tone="destructive" />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Filter by name or category" className="h-9 pl-9" />
          </div>
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["grid", "table"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === v
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((it) => (
              <article
                key={it.name}
                className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gradient-to-br from-secondary to-muted font-mono text-sm font-semibold text-foreground">
                      {it.icon}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{it.name}</h3>
                      <div className="truncate text-xs text-muted-foreground">{it.category}</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <StatusBadge status={it.status} />
                  <Switch
                    checked={enabled[it.name]}
                    onCheckedChange={(v) => setEnabled((e) => ({ ...e, [it.name]: v }))}
                  />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">Last sync</div>
                    <div className="mt-0.5 font-medium tabular-nums text-foreground">{it.sync}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Events</div>
                    <div className="mt-0.5 font-medium tabular-nums text-foreground">
                      {it.events}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Integration</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last sync</th>
                  <th className="px-4 py-3 font-medium">Events</th>
                  <th className="px-4 py-3 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {integrations.map((it) => (
                  <tr key={it.name} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-secondary to-muted font-mono text-xs font-semibold">
                          {it.icon}
                        </div>
                        <span className="font-medium">{it.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{it.category}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={it.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{it.sync}</td>
                    <td className="px-4 py-3 tabular-nums">{it.events}</td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={enabled[it.name]}
                        onCheckedChange={(v) => setEnabled((e) => ({ ...e, [it.name]: v }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "info" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "info"
        ? "text-info"
        : tone === "destructive"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value}</div>
    </div>
  );
}
