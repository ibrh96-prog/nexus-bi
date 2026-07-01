import { io, type Socket } from "socket.io-client";

/**
 * Shared socket instance for the collab feature. Lazily connects on first use
 * and reuses the same connection across hooks/components.
 *
 * Set VITE_COLLAB_URL to point at the standalone Express+Socket.io server
 * (e.g. http://localhost:3001). Defaults to same-origin.
 */
let socket: Socket | null = null;

export function getCollabSocket(): Socket {
  if (socket) return socket;
  const url = import.meta.env.VITE_COLLAB_URL as string | undefined;
  socket = io(url ?? "/", {
    autoConnect: true,
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });
  return socket;
}

export function disconnectCollabSocket() {
  socket?.disconnect();
  socket = null;
}

/* Wire event names — keep in sync with server/collab.ts */
export const COLLAB_EVENTS = {
  join: "join",
  cursorMove: "cursor-move",
  nodeUpdate: "node-update",
  edgeAdd: "edge-add",
  presenceSnapshot: "presence:snapshot",
  presenceJoin: "presence:join",
  presenceLeave: "presence:leave",
} as const;
