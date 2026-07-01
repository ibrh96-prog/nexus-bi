import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { Download, MoreHorizontal, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { AiInsightsPanel } from "@/components/ai-insights-panel";
import { PageHeader } from "@/components/page-header";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { useSimulatedLoading } from "@/hooks/use-simulated-loading";
import { Button } from "@/components/ui/button";
import { metricCards, revenueSeries, capacityData, resourceDistribution } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Command Center — Nexus BI" },
      {
        name: "description",
        content:
          "Executive command center with revenue trajectories, operational capacity, and resource distribution.",
      },
    ],
  }),
  component: Dashboard,
});

const currency = (v: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "USD",
  }).format(v);
const number = (v: number) => new Intl.NumberFormat("en-US").format(Math.round(v));

// ---------- Time range ----------
type RangeKey = "7D" | "30D" | "90D" | "12M";
const RANGES: { key: RangeKey; label: string; points: number; step: "day" | "week" | "month" }[] = [
  { key: "7D", label: "7D", points: 7, step: "day" },
  { key: "30D", label: "30D", points: 30, step: "day" },
  { key: "90D", label: "90D", points: 13, step: "week" },
  { key: "12M", label: "12M", points: 12, step: "month" },
];

// Deterministic pseudo-random for stable mock data.
function seeded(i: number, salt = 1) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function buildRevenue(range: RangeKey) {
  const cfg = RANGES.find((r) => r.key === range)!;
  if (cfg.step === "month") {
    return revenueSeries.map((r) => ({
      label: r.month,
      revenue: r.revenue,
      forecast: r.forecast,
      automated: r.automated,
    }));
  }
  const now = new Date();
  const points = cfg.points;
  // Scale monthly totals down to daily/weekly.
  const monthly = revenueSeries[revenueSeries.length - 1];
  const base = cfg.step === "day" ? monthly.revenue / 30 : monthly.revenue / 4.3;
  const autoRatio = monthly.automated / monthly.revenue;
  const out: Array<{ label: string; revenue: number; forecast: number; automated: number }> = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now);
    if (cfg.step === "day") d.setDate(d.getDate() - i);
    else d.setDate(d.getDate() - i * 7);
    const noise = 0.85 + seeded(i, 3) * 0.35;
    const growth = 1 + (points - i) * 0.006;
    const revenue = Math.round(base * noise * growth);
    const forecast = Math.round(base * (0.92 + seeded(i, 7) * 0.16) * growth);
    const automated = Math.round(revenue * (autoRatio * (0.9 + seeded(i, 11) * 0.2)));
    const label =
      cfg.step === "day"
        ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString("en-US", { month: "short" })}`;
    out.push({ label, revenue, forecast, automated });
  }
  return out;
}

function buildRuns(range: RangeKey) {
  const cfg = RANGES.find((r) => r.key === range)!;
  const now = new Date();
  const points = cfg.points;
  const base = cfg.step === "month" ? 6800 : cfg.step === "week" ? 1600 : 240;
  const out: Array<{ label: string; runs: number; failures: number }> = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now);
    if (cfg.step === "day") d.setDate(d.getDate() - i);
    else if (cfg.step === "week") d.setDate(d.getDate() - i * 7);
    else d.setMonth(d.getMonth() - i);
    const runs = Math.round(base * (0.8 + seeded(i, 19) * 0.5) + i * 6);
    const failures = Math.round(runs * (0.01 + seeded(i, 23) * 0.03));
    const label =
      cfg.step === "month"
        ? d.toLocaleDateString("en-US", { month: "short" })
        : cfg.step === "week"
          ? `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString("en-US", { month: "short" })}`
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    out.push({ label, runs, failures });
  }
  return out;
}

// ---------- Custom tooltip ----------
interface TooltipDatum {
  name?: string;
  dataKey?: string | number;
  value?: number;
  color?: string;
  payload?: Record<string, unknown>;
}
interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipDatum[];
  format?: (v: number) => string;
  hint?: string;
}

function CustomTooltip({ active, label, payload, format = number, hint }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload.reduce((s, p) => s + (typeof p.value === "number" ? p.value : 0), 0);
  return (
    <div className="min-w-[180px] rounded-lg border border-border bg-popover/95 p-3 text-xs shadow-lg backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-4 border-b border-border pb-1.5">
        <span className="font-semibold text-foreground">{label}</span>
        {payload.length > 1 && (
          <span className="tabular-nums text-muted-foreground">Σ {format(total)}</span>
        )}
      </div>
      <ul className="space-y-1">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: p.color }} />
              <span className="capitalize">{p.name ?? p.dataKey}</span>
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {typeof p.value === "number" ? format(p.value) : "—"}
            </span>
          </li>
        ))}
      </ul>
      {hint && (
        <div className="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
          {hint}
        </div>
      )}
    </div>
  );
}

// ---------- Range toggle ----------
function RangeToggle({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Time range"
      className="inline-flex rounded-md border border-border bg-card p-0.5"
    >
      {RANGES.map((r) => (
        <button
          key={r.key}
          role="tab"
          aria-selected={value === r.key}
          onClick={() => onChange(r.key)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === r.key
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-border bg-card ${className}`}>
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {action}
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Dashboard() {
  const loading = useSimulatedLoading(500);
  const [range, setRange] = useState<RangeKey>("30D");

  const revenueData = useMemo(() => buildRevenue(range), [range]);
  const runsData = useMemo(() => buildRuns(range), [range]);

  const rangeLabel = RANGES.find((r) => r.key === range)!.label;

  return (
    <div className="flex">
      <div className="min-w-0 flex-1">
        <PageHeader
          eyebrow="Overview"
          title="Executive Command Center"
          description="Real-time telemetry across revenue, workflows, and resource allocation."
          actions={
            <>
              <RangeToggle value={range} onChange={setRange} />
              <Button size="sm" className="h-9">
                <Download className="mr-2 h-3.5 w-3.5" /> Export
              </Button>
            </>
          }
        />

        {loading ? (
          <DashboardSkeleton />
        ) : (
          <div className="space-y-6 p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {metricCards.map((m) => (
                <MetricCard key={m.label} {...m} />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ChartCard
                title="Revenue Trajectory"
                subtitle={`Actual vs. forecast · ${rangeLabel} window`}
                className="lg:col-span-2"
                action={
                  <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success">
                    <TrendingUp className="h-3 w-3" /> +14.2% YoY
                  </span>
                }
              >
                <div className="h-72">
                  <ResponsiveContainer>
                    <AreaChart
                      data={revenueData}
                      margin={{ top: 5, right: 8, left: -12, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.32} />
                          <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="auto" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-chart-3)" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="var(--color-border)"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={24}
                      />
                      <YAxis
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={currency}
                      />
                      <Tooltip
                        cursor={{
                          stroke: "var(--color-border)",
                          strokeWidth: 1,
                          strokeDasharray: "3 3",
                        }}
                        content={
                          <CustomTooltip
                            format={currency}
                            hint={`${rangeLabel} window · mock data`}
                          />
                        }
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="var(--color-chart-1)"
                        strokeWidth={2}
                        fill="url(#rev)"
                        name="Revenue"
                        activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="automated"
                        stroke="var(--color-chart-3)"
                        strokeWidth={2}
                        fill="url(#auto)"
                        name="Automated"
                        activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        stroke="var(--color-muted-foreground)"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        name="Forecast"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Resource Distribution" subtitle="Cloud spend by category">
                <div className="h-72">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={resourceDistribution}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        stroke="var(--color-card)"
                        strokeWidth={2}
                      >
                        {resourceDistribution.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={
                          <CustomTooltip
                            format={(v) => `${v}%`}
                            hint="Share of monthly cloud spend"
                          />
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {resourceDistribution.map((r) => (
                    <li key={r.name} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: r.color }} />
                        {r.name}
                      </span>
                      <span className="font-medium tabular-nums text-foreground">{r.value}%</span>
                    </li>
                  ))}
                </ul>
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCard
                title="Operational Capacity"
                subtitle="Utilization by team, current sprint"
              >
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart
                      data={capacityData}
                      margin={{ top: 5, right: 8, left: -18, bottom: 0 }}
                    >
                      <CartesianGrid
                        stroke="var(--color-border)"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="team"
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--color-muted)", opacity: 0.5 }}
                        content={
                          <CustomTooltip
                            format={(v) => `${v}%`}
                            hint="Sprint-to-date utilization"
                          />
                        }
                      />
                      <Bar
                        dataKey="used"
                        fill="var(--color-chart-1)"
                        radius={[4, 4, 0, 0]}
                        name="Utilization"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard
                title="Workflow Executions"
                subtitle={`Runs across 247 active workflows · ${rangeLabel}`}
              >
                <div className="h-64">
                  <ResponsiveContainer>
                    <LineChart data={runsData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid
                        stroke="var(--color-border)"
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={24}
                      />
                      <YAxis
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        cursor={{
                          stroke: "var(--color-border)",
                          strokeWidth: 1,
                          strokeDasharray: "3 3",
                        }}
                        content={
                          <CustomTooltip format={number} hint="Successful vs. failed executions" />
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="runs"
                        stroke="var(--color-chart-2)"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-card)" }}
                        name="Runs"
                      />
                      <Line
                        type="monotone"
                        dataKey="failures"
                        stroke="var(--color-destructive)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
                        name="Failures"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>
          </div>
        )}
      </div>

      <AiInsightsPanel />
    </div>
  );
}
