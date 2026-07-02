import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getInsights, updateInsightStatus, type InsightStatus } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

/** Shared by the header notifications popover and the dashboard AI Insights sidebar. */
export function useInsights(status?: InsightStatus) {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ["insights", status ?? "all"],
    queryFn: () => getInsights(status),
    enabled: !!token,
    staleTime: 30_000,
  });
}

export function useDismissInsight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => updateInsightStatus(id, "resolved"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}
