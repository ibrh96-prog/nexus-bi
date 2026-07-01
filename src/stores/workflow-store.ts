import { create } from "zustand";
import { COLLAB_EVENTS, getCollabSocket } from "@/lib/collab-socket";

/* ------------------------------------------------------------------ */
/* Collab emit helper                                                  */
/* ------------------------------------------------------------------ */
function safeEmit(event: string, payload: unknown) {
  // Only emit when the collab socket is actually connected — the store still
  // works fine in single-player mode without a running Socket.io server.
  try {
    const s = getCollabSocket();
    if (s.connected) s.emit(event, payload);
  } catch {
    /* no-op */
  }
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
export interface NodePosition {
  x: number;
  y: number;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: NodePosition;
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

interface Snapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface SaveResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

interface WorkflowState extends Snapshot {
  history: Snapshot[];
  future: Snapshot[];
  isSaving: boolean;
  lastSavedAt: number | null;

  // Actions
  addNode: (node: WorkflowNode) => void;
  updateNodePosition: (id: string, position: NodePosition) => void;
  connectNodes: (source: string, target: string) => void;
  deleteNode: (id: string) => void;
  undo: () => void;
  redo: () => void;
  saveWorkflow: (workflowId: string) => Promise<SaveResult>;

  // Utilities
  reset: (snapshot?: Snapshot) => void;

  // Remote (socket) appliers — do NOT re-emit.
  applyRemoteNodeUpdate: (nodeId: string, patch: { position?: NodePosition; data?: Record<string, unknown>; type?: string }) => void;
  applyRemoteEdgeAdd: (edge: WorkflowEdge) => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const HISTORY_LIMIT = 50;

const snapshot = (s: Snapshot): Snapshot => ({
  nodes: s.nodes.map((n) => ({ ...n, position: { ...n.position }, data: { ...n.data } })),
  edges: s.edges.map((e) => ({ ...e })),
});

const pushHistory = (history: Snapshot[], current: Snapshot): Snapshot[] => {
  const next = [...history, snapshot(current)];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
};

const randomId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */
export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  history: [],
  future: [],
  isSaving: false,
  lastSavedAt: null,

  addNode: (node) => {
    const normalized: WorkflowNode = {
      ...node,
      position: { ...node.position },
      data: { ...node.data },
    };
    set((state) => ({
      history: pushHistory(state.history, state),
      future: [],
      nodes: [...state.nodes, normalized],
    }));
    safeEmit(COLLAB_EVENTS.nodeUpdate, {
      nodeId: normalized.id,
      position: normalized.position,
      data: normalized.data,
      type: normalized.type,
    });
  },

  updateNodePosition: (id, position) => {
    let changed = false;
    set((state) => {
      const target = state.nodes.find((n) => n.id === id);
      if (!target) return state;
      if (target.position.x === position.x && target.position.y === position.y) return state;
      changed = true;
      return {
        history: pushHistory(state.history, state),
        future: [],
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, position: { ...position } } : n,
        ),
      };
    });
    if (changed) {
      safeEmit(COLLAB_EVENTS.nodeUpdate, { nodeId: id, position });
    }
  },

  connectNodes: (source, target) => {
    let created: WorkflowEdge | null = null;
    set((state) => {
      if (source === target) return state;
      const sourceExists = state.nodes.some((n) => n.id === source);
      const targetExists = state.nodes.some((n) => n.id === target);
      if (!sourceExists || !targetExists) return state;
      const duplicate = state.edges.some((e) => e.source === source && e.target === target);
      if (duplicate) return state;
      created = { id: randomId("edge"), source, target };
      return {
        history: pushHistory(state.history, state),
        future: [],
        edges: [...state.edges, created],
      };
    });
    if (created) safeEmit(COLLAB_EVENTS.edgeAdd, { edge: created });
  },

  deleteNode: (id) =>
    set((state) => {
      if (!state.nodes.some((n) => n.id === id)) return state;
      return {
        history: pushHistory(state.history, state),
        future: [],
        nodes: state.nodes.filter((n) => n.id !== id),
        edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      };
    }),


  undo: () =>
    set((state) => {
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      return {
        history: state.history.slice(0, -1),
        future: [snapshot(state), ...state.future],
        nodes: previous.nodes,
        edges: previous.edges,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        history: pushHistory(state.history, state),
        future: rest,
        nodes: next.nodes,
        edges: next.edges,
      };
    }),

  saveWorkflow: async (workflowId) => {
    if (!workflowId) {
      return { ok: false, status: 400, error: "workflowId is required" };
    }
    const { nodes, edges } = get();
    set({ isSaving: true });
    const startedAt = performance.now();
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(workflowId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json") ? await res.json() : await res.text();
      if (!res.ok) {
        set({ isSaving: false });
        const { captureEvent, reportError } = await import("@/lib/observability");
        captureEvent("workflow_save_failed", {
          workflow_id: workflowId,
          status: res.status,
          node_count: nodes.length,
          edge_count: edges.length,
        });
        reportError(new Error(`workflow save failed: ${res.status}`), { workflowId, data });
        return {
          ok: false,
          status: res.status,
          error: typeof data === "string" ? data : (data as { error?: string })?.error,
          data,
        };
      }
      set({ isSaving: false, lastSavedAt: Date.now() });
      const { captureEvent } = await import("@/lib/observability");
      captureEvent("workflow_saved", {
        workflow_id: workflowId,
        node_count: nodes.length,
        edge_count: edges.length,
        duration_ms: Math.round(performance.now() - startedAt),
      });
      return { ok: true, status: res.status, data };
    } catch (err) {
      set({ isSaving: false });
      const { reportError } = await import("@/lib/observability");
      reportError(err, { workflowId, phase: "saveWorkflow" });
      return {
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  },


  reset: (initial) =>
    set(() => ({
      nodes: initial ? snapshot(initial).nodes : [],
      edges: initial ? snapshot(initial).edges : [],
      history: [],
      future: [],
    })),

  /* ---- Remote appliers (no re-emit) --------------------------------- */
  applyRemoteNodeUpdate: (nodeId, patch) =>
    set((state) => {
      const existing = state.nodes.find((n) => n.id === nodeId);
      if (!existing) {
        // Node doesn't exist locally yet — create a stub so remote drags/creates apply.
        if (!patch.position || !patch.type) return state;
        return {
          nodes: [
            ...state.nodes,
            {
              id: nodeId,
              type: patch.type,
              position: { ...patch.position },
              data: patch.data ? { ...patch.data } : {},
            },
          ],
        };
      }
      return {
        nodes: state.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                position: patch.position ? { ...patch.position } : n.position,
                data: patch.data ? { ...n.data, ...patch.data } : n.data,
                type: patch.type ?? n.type,
              }
            : n,
        ),
      };
    }),

  applyRemoteEdgeAdd: (edge) =>
    set((state) => {
      if (state.edges.some((e) => e.id === edge.id)) return state;
      if (state.edges.some((e) => e.source === edge.source && e.target === edge.target)) return state;
      return { edges: [...state.edges, { ...edge }] };
    }),
}));

/* Selectors for convenience */
export const selectCanUndo = (s: WorkflowState) => s.history.length > 0;
export const selectCanRedo = (s: WorkflowState) => s.future.length > 0;
