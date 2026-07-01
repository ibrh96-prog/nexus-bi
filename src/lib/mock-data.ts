export const revenueSeries = [
  { month: "Jan", revenue: 128000, forecast: 130000, automated: 42000 },
  { month: "Feb", revenue: 142000, forecast: 138000, automated: 51000 },
  { month: "Mar", revenue: 156000, forecast: 149000, automated: 63000 },
  { month: "Apr", revenue: 168000, forecast: 161000, automated: 74000 },
  { month: "May", revenue: 182000, forecast: 175000, automated: 88000 },
  { month: "Jun", revenue: 201000, forecast: 190000, automated: 102000 },
  { month: "Jul", revenue: 218000, forecast: 208000, automated: 121000 },
  { month: "Aug", revenue: 234000, forecast: 224000, automated: 138000 },
  { month: "Sep", revenue: 251000, forecast: 240000, automated: 154000 },
  { month: "Oct", revenue: 268000, forecast: 258000, automated: 172000 },
  { month: "Nov", revenue: 289000, forecast: 275000, automated: 191000 },
  { month: "Dec", revenue: 312000, forecast: 296000, automated: 214000 },
];

export const capacityData = [
  { team: "Support", used: 78, capacity: 100 },
  { team: "Sales", used: 62, capacity: 100 },
  { team: "Engineering", used: 91, capacity: 100 },
  { team: "Finance", used: 44, capacity: 100 },
  { team: "Marketing", used: 68, capacity: 100 },
  { team: "Ops", used: 82, capacity: 100 },
];

export const resourceDistribution = [
  { name: "Compute", value: 34, color: "var(--color-chart-1)" },
  { name: "Storage", value: 22, color: "var(--color-chart-2)" },
  { name: "AI Inference", value: 26, color: "var(--color-chart-3)" },
  { name: "Networking", value: 12, color: "var(--color-chart-4)" },
  { name: "Other", value: 6, color: "var(--color-chart-5)" },
];

export const metricCards = [
  {
    label: "Automation ROI",
    value: "$1.84M",
    change: 12.4,
    trend: "up" as const,
    hint: "vs. last quarter",
  },
  {
    label: "Active Workflows",
    value: "247",
    change: 8.1,
    trend: "up" as const,
    hint: "18 deployed this week",
  },
  {
    label: "Predicted Churn",
    value: "3.2%",
    change: -0.6,
    trend: "down" as const,
    hint: "AI 30-day forecast",
  },
  {
    label: "Avg. Resolution",
    value: "4m 12s",
    change: -18.3,
    trend: "down" as const,
    hint: "faster than baseline",
  },
];

export const aiInsights = [
  {
    id: "1",
    severity: "critical" as const,
    title: "Anomaly detected in Q3 server costs",
    body: "AWS EC2 spend spiked 34% above the 30-day baseline on us-east-1. Root cause: idle GPU instances in ml-training cluster.",
    time: "2m ago",
    tag: "Cost",
  },
  {
    id: "2",
    severity: "recommendation" as const,
    title: "Reroute 20% of support tickets",
    body: "Recent query trends show 1,240 tickets could be auto-resolved by the knowledge base. Est. savings: 62 agent-hours/week.",
    time: "18m ago",
    tag: "Ops",
  },
  {
    id: "3",
    severity: "info" as const,
    title: "Churn model retrained",
    body: "Model v4.11 improved F1 by 4.2%. 23 new at-risk accounts flagged in the last hour.",
    time: "1h ago",
    tag: "ML",
  },
  {
    id: "4",
    severity: "warning" as const,
    title: "Salesforce sync degraded",
    body: "API latency > 2.1s on lead-enrichment webhook. Retries succeeding but pipeline throughput reduced by 12%.",
    time: "2h ago",
    tag: "Integration",
  },
  {
    id: "5",
    severity: "recommendation" as const,
    title: "Shift EU workloads to Frankfurt",
    body: "Predicted 22% latency improvement for 4,300 daily active users. Migration risk: low.",
    time: "4h ago",
    tag: "Infra",
  },
];

export const integrations = [
  { name: "Stripe", category: "Payments", status: "connected", sync: "2m ago", events: "184K/mo", icon: "S" },
  { name: "Salesforce", category: "CRM", status: "syncing", sync: "syncing…", events: "62K/mo", icon: "SF" },
  { name: "AWS", category: "Infrastructure", status: "connected", sync: "just now", events: "1.2M/mo", icon: "AW" },
  { name: "Slack", category: "Communication", status: "connected", sync: "1m ago", events: "38K/mo", icon: "SL" },
  { name: "HubSpot", category: "Marketing", status: "error", sync: "18m ago", events: "24K/mo", icon: "HS" },
  { name: "Zendesk", category: "Support", status: "connected", sync: "4m ago", events: "51K/mo", icon: "ZD" },
  { name: "Snowflake", category: "Data Warehouse", status: "connected", sync: "12m ago", events: "88M/mo", icon: "SN" },
  { name: "GitHub", category: "DevOps", status: "connected", sync: "3m ago", events: "9.2K/mo", icon: "GH" },
  { name: "Notion", category: "Docs", status: "syncing", sync: "syncing…", events: "12K/mo", icon: "NO" },
  { name: "Segment", category: "Analytics", status: "connected", sync: "6m ago", events: "440K/mo", icon: "SG" },
  { name: "Twilio", category: "Comms", status: "connected", sync: "1m ago", events: "72K/mo", icon: "TW" },
  { name: "PagerDuty", category: "Incidents", status: "error", sync: "1h ago", events: "1.1K/mo", icon: "PD" },
] as const;

export type IntegrationStatus = "connected" | "syncing" | "error";
