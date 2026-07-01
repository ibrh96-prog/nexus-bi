import { Server as IOServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";

/* ------------------------------------------------------------------ */
/* Wire events                                                         */
/* ------------------------------------------------------------------ */
export interface CursorMovePayload {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
}
export interface NodeUpdatePayload {
  userId: string;
  nodeId: string;
  position?: { x: number; y: number };
  data?: Record<string, unknown>;
  type?: string;
}
export interface EdgeAddPayload {
  userId: string;
  edge: { id: string; source: string; target: string };
}
export interface PresenceUser {
  userId: string;
  name: string;
  color: string;
  socketId: string;
}

interface JoinPayload {
  workflowId: string;
  user: { userId: string; name: string; color: string };
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */
const roomOf = (workflowId: string) => `workflow:${workflowId}`;

// Track presence per socket so we can clean up on disconnect.
const socketPresence = new Map<
  string,
  { workflowId: string; user: { userId: string; name: string; color: string } }
>();

export function attachCollab(httpServer: HttpServer) {
  const io = new IOServer(httpServer, {
    cors: {
      // Tighten in production; permissive here for local dev.
      origin: process.env.COLLAB_CORS_ORIGIN?.split(",") ?? "*",
      credentials: false,
    },
    // Reasonable per-message limits so a bad client can't OOM the server.
    maxHttpBufferSize: 32 * 1024,
  });

  io.on("connection", (socket: Socket) => {
    socket.on("join", ({ workflowId, user }: JoinPayload) => {
      if (!workflowId || !user?.userId) return;
      const room = roomOf(workflowId);
      socket.join(room);
      socketPresence.set(socket.id, { workflowId, user });

      // Tell the joiner about existing peers.
      const peers: PresenceUser[] = [];
      for (const [sid, info] of socketPresence) {
        if (sid !== socket.id && info.workflowId === workflowId) {
          peers.push({ ...info.user, socketId: sid });
        }
      }
      socket.emit("presence:snapshot", { peers });

      // Tell the room a new peer arrived.
      socket.to(room).emit("presence:join", { ...user, socketId: socket.id });
    });

    socket.on("cursor-move", (payload: CursorMovePayload) => {
      const info = socketPresence.get(socket.id);
      if (!info) return;
      socket.to(roomOf(info.workflowId)).emit("cursor-move", {
        ...payload,
        userId: info.user.userId,
        name: info.user.name,
        color: info.user.color,
      });
    });

    socket.on("node-update", (payload: NodeUpdatePayload) => {
      const info = socketPresence.get(socket.id);
      if (!info || !payload?.nodeId) return;
      socket.to(roomOf(info.workflowId)).emit("node-update", {
        ...payload,
        userId: info.user.userId,
      });
    });

    socket.on("edge-add", (payload: EdgeAddPayload) => {
      const info = socketPresence.get(socket.id);
      if (!info || !payload?.edge?.id) return;
      socket.to(roomOf(info.workflowId)).emit("edge-add", {
        ...payload,
        userId: info.user.userId,
      });
    });

    socket.on("disconnect", () => {
      const info = socketPresence.get(socket.id);
      if (!info) return;
      socketPresence.delete(socket.id);
      socket.to(roomOf(info.workflowId)).emit("presence:leave", {
        userId: info.user.userId,
        socketId: socket.id,
      });
    });
  });

  return io;
}
