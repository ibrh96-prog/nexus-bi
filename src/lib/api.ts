/**
 * Shared fetch wrapper for talking to the same-origin Express API. Attaches
 * the Bearer token from the auth store and normalizes error handling.
 */
import { useAuthStore } from "@/stores/auth-store";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      typeof data === "string" ? data : ((data as { error?: string })?.error ?? "Request failed");
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/* ------------------------------------------------------------------ */
/* Typed resource shapes + fetchers                                    */
/* ------------------------------------------------------------------ */
export type AuthUser = { id: string; email: string; role: "admin" | "editor" | "viewer" };

export type Metric = {
  id: string;
  revenue: number;
  activeWorkflows: number;
  predictedChurn: number;
  averageResolutionTime: number;
  recordedAt: string;
};

export type RevenueSeriesPoint = {
  id: string;
  period: string;
  revenue: number;
  forecast: number;
  automated: number;
  recordedAt: string;
};

export type CapacitySnapshot = {
  id: string;
  team: string;
  used: number;
  capacity: number;
  recordedAt: string;
};

export type ResourceDistributionEntry = {
  id: string;
  name: string;
  value: number;
  recordedAt: string;
};

export type InsightSeverity = "low" | "medium" | "high" | "critical";
export type InsightType = "anomaly" | "recommendation";
export type InsightStatus = "pending" | "resolved" | "handled";

export type Insight = {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  message: string;
  context: Record<string, unknown> | null;
  status: InsightStatus;
  createdAt: string;
};

export const login = (email: string) =>
  apiFetch<{ token: string; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const getMe = () => apiFetch<AuthUser>("/api/auth/me");

export const getMetrics = (limit = 2) => apiFetch<Metric[]>(`/api/metrics?limit=${limit}`);
export const getRevenueSeries = () => apiFetch<RevenueSeriesPoint[]>("/api/revenue-series");
export const getCapacity = () => apiFetch<CapacitySnapshot[]>("/api/capacity");
export const getResourceDistribution = () =>
  apiFetch<ResourceDistributionEntry[]>("/api/resource-distribution");

export const getInsights = (status?: InsightStatus) =>
  apiFetch<Insight[]>(`/api/insights${status ? `?status=${status}` : ""}`);
export const updateInsightStatus = (id: string, status: InsightStatus) =>
  apiFetch<Insight>(`/api/insights/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
