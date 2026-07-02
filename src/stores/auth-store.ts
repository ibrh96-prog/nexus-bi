import { create } from "zustand";
import { ApiError, getMe, login as loginRequest, type AuthUser } from "@/lib/api";

const TOKEN_KEY = "nexus_bi_token";

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** "idle" until hydrate() has run once (checked localStorage / verified the token). */
  status: "idle" | "loading" | "ready";
  login: (email: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  status: "idle",

  login: async (email) => {
    try {
      const { token, user } = await loginRequest(email);
      localStorage.setItem(TOKEN_KEY, token);
      set({ token, user, status: "ready" });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "Network error" };
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ token: null, user: null, status: "ready" });
  },

  hydrate: async () => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ status: "ready" });
      return;
    }
    set({ token, status: "loading" });
    try {
      const user = await getMe();
      set({ user, status: "ready" });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({ token: null, user: null, status: "ready" });
    }
  },
}));
