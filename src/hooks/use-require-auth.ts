import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Redirects to /login once auth hydration finishes and there's no token.
 * `ready` is false while hydrating (avoids a flash of "please sign in"
 * before we've checked localStorage) and while redirecting.
 */
export function useRequireAuth() {
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (status === "ready" && !token) {
      navigate({ to: "/login" });
    }
  }, [status, token, navigate]);

  return { ready: status === "ready" && !!token };
}
