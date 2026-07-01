import { create } from "zustand";

export interface RemoteCursor {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
  updatedAt: number;
}

interface PresenceState {
  self: { userId: string; name: string; color: string } | null;
  cursors: Record<string, RemoteCursor>;
  peers: Record<string, { userId: string; name: string; color: string }>;
  setSelf: (self: PresenceState["self"]) => void;
  upsertPeer: (p: { userId: string; name: string; color: string }) => void;
  removePeer: (userId: string) => void;
  setCursor: (c: RemoteCursor) => void;
  removeCursor: (userId: string) => void;
  clearAll: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  self: null,
  cursors: {},
  peers: {},
  setSelf: (self) => set({ self }),
  upsertPeer: (p) => set((s) => ({ peers: { ...s.peers, [p.userId]: p } })),
  removePeer: (userId) =>
    set((s) => {
      const { [userId]: _peer, ...restPeers } = s.peers;
      const { [userId]: _cursor, ...restCursors } = s.cursors;
      void _peer;
      void _cursor;
      return { peers: restPeers, cursors: restCursors };
    }),
  setCursor: (c) => set((s) => ({ cursors: { ...s.cursors, [c.userId]: c } })),
  removeCursor: (userId) =>
    set((s) => {
      const { [userId]: _drop, ...rest } = s.cursors;
      void _drop;
      return { cursors: rest };
    }),
  clearAll: () => set({ cursors: {}, peers: {} }),
}));

/* Deterministic color per userId so the same user always gets the same swatch. */
const CURSOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];
export function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return CURSOR_PALETTE[Math.abs(hash) % CURSOR_PALETTE.length];
}
