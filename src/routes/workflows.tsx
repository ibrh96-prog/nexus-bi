import { createFileRoute } from "@tanstack/react-router";
import {
  Zap,
  Mail,
  MessageSquare,
  Database,
  Bot,
  GitBranch,
  Play,
  Save,
  Plus,
  Search,
  MousePointer2,
  Layers,
  Sparkles,
  Trash2,
  X,
  BoxSelect,
  Copy,
  ClipboardPaste,
  Magnet,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Undo2,
  Redo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSimulatedLoading } from "@/hooks/use-simulated-loading";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workflows")({
  head: () => ({
    meta: [
      { title: "Workflow Builder — Nexus BI" },
      { name: "description", content: "Node-based visual workflow builder for AI-driven automations." },
    ],
  }),
  component: WorkflowsPage,
});

type NodeKind = "trigger" | "logic" | "ai" | "action";
type IconType = React.ComponentType<{ className?: string }>;

interface WorkflowNode {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle: string;
  iconKey: string;
  x: number;
  y: number;
}

interface WorkflowEdge {
  id: string;
  from: string;
  to: string;
}

const ICONS: Record<string, IconType> = {
  zap: Zap,
  mail: Mail,
  message: MessageSquare,
  database: Database,
  bot: Bot,
  branch: GitBranch,
  play: Play,
};

const NODE_W = 240;
const NODE_H = 84;
const GRID = 20;
const SNAP_THRESHOLD = 6;

interface AlignGuide {
  orientation: "v" | "h";
  /** For v: x coord. For h: y coord. */
  pos: number;
  /** For v: [minY, maxY]. For h: [minX, maxX]. */
  span: [number, number];
}

const snapToGrid = (v: number) => Math.round(v / GRID) * GRID;

function computeSnap(
  primary: { x: number; y: number },
  others: WorkflowNode[],
  gridEnabled: boolean,
): { x: number; y: number; guides: AlignGuide[] } {
  const guides: AlignGuide[] = [];
  const pLeft = primary.x;
  const pCX = primary.x + NODE_W / 2;
  const pRight = primary.x + NODE_W;
  const pTop = primary.y;
  const pCY = primary.y + NODE_H / 2;
  const pBot = primary.y + NODE_H;

  const pXs = [pLeft, pCX, pRight];
  const pYs = [pTop, pCY, pBot];

  let bestDX = 0;
  let bestAX = Infinity;
  let bestGX: AlignGuide | null = null;
  let bestDY = 0;
  let bestAY = Infinity;
  let bestGY: AlignGuide | null = null;

  for (const o of others) {
    const oXs = [o.x, o.x + NODE_W / 2, o.x + NODE_W];
    const oYs = [o.y, o.y + NODE_H / 2, o.y + NODE_H];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const dx = oXs[j] - pXs[i];
        const adx = Math.abs(dx);
        if (adx <= SNAP_THRESHOLD && adx < bestAX) {
          bestAX = adx;
          bestDX = dx;
          bestGX = {
            orientation: "v",
            pos: oXs[j],
            span: [Math.min(pTop, o.y), Math.max(pBot, o.y + NODE_H)],
          };
        }
        const dy = oYs[j] - pYs[i];
        const ady = Math.abs(dy);
        if (ady <= SNAP_THRESHOLD && ady < bestAY) {
          bestAY = ady;
          bestDY = dy;
          bestGY = {
            orientation: "h",
            pos: oYs[j],
            span: [Math.min(pLeft, o.x), Math.max(pRight, o.x + NODE_W)],
          };
        }
      }
    }
  }

  let nx = primary.x + bestDX;
  let ny = primary.y + bestDY;
  if (!bestGX && gridEnabled) nx = snapToGrid(primary.x);
  if (!bestGY && gridEnabled) ny = snapToGrid(primary.y);
  if (bestGX) guides.push(bestGX);
  if (bestGY) guides.push(bestGY);
  return { x: nx, y: ny, guides };
}


const kindStyles: Record<NodeKind, { badge: string; ring: string; iconBg: string; label: string }> = {
  trigger: { badge: "bg-warning/10 text-warning border-warning/30", ring: "hover:border-warning/50", iconBg: "bg-warning/10 text-warning", label: "Trigger" },
  logic: { badge: "bg-info/10 text-info border-info/30", ring: "hover:border-info/50", iconBg: "bg-info/10 text-info", label: "Logic" },
  ai: { badge: "bg-primary/10 text-primary border-primary/30", ring: "hover:border-primary/50", iconBg: "bg-primary/10 text-primary", label: "AI" },
  action: { badge: "bg-success/10 text-success border-success/30", ring: "hover:border-success/50", iconBg: "bg-success/10 text-success", label: "Action" },
};

const paletteItems: Array<{ kind: NodeKind; label: string; desc: string; iconKey: string; title: string; subtitle: string }> = [
  { kind: "trigger", label: "Trigger", desc: "Event source", iconKey: "zap", title: "New Trigger", subtitle: "Configure event source" },
  { kind: "logic", label: "Logic", desc: "Condition / branch", iconKey: "branch", title: "Condition", subtitle: "If … then …" },
  { kind: "ai", label: "AI Step", desc: "Model call", iconKey: "bot", title: "AI Step", subtitle: "GPT-4o · default prompt" },
  { kind: "action", label: "Action", desc: "Do something", iconKey: "play", title: "Action", subtitle: "Configure destination" },
];

const initialNodes: WorkflowNode[] = [
  { id: "t1", kind: "trigger", title: "Incoming Lead", subtitle: "Salesforce · New record", iconKey: "zap", x: 40, y: 60 },
  { id: "t2", kind: "trigger", title: "Support Ticket Escalation", subtitle: "Zendesk · Priority ≥ high", iconKey: "message", x: 40, y: 260 },
  { id: "l1", kind: "logic", title: "Score & Route", subtitle: "If ICP fit > 0.7", iconKey: "branch", x: 320, y: 60 },
  { id: "a1", kind: "ai", title: "Draft AI Response", subtitle: "GPT-4o · Tone: consultative", iconKey: "bot", x: 320, y: 260 },
  { id: "x1", kind: "action", title: "Update CRM", subtitle: "Salesforce · Contact + Opp", iconKey: "database", x: 620, y: 60 },
  { id: "x2", kind: "action", title: "Send Email", subtitle: "Sequences · Template #48", iconKey: "mail", x: 620, y: 170 },
  { id: "x3", kind: "action", title: "Notify Agent", subtitle: "Slack · #cs-tier2", iconKey: "message", x: 620, y: 300 },
];

const initialEdges: WorkflowEdge[] = [
  { id: "e1", from: "t1", to: "l1" },
  { id: "e2", from: "l1", to: "x1" },
  { id: "e3", from: "l1", to: "x2" },
  { id: "e4", from: "t2", to: "a1" },
  { id: "e5", from: "a1", to: "x2" },
  { id: "e6", from: "a1", to: "x3" },
];

function edgePath(ax: number, ay: number, bx: number, by: number) {
  const mx = (ax + bx) / 2;
  return `M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`;
}

let idSeq = 100;
const nextId = (prefix: string) => `${prefix}${++idSeq}`;

function rectsIntersect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, r: { x: number; y: number; w: number; h: number }) {
  // quick reject via bbox then sample points along the segment
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  if (maxX < r.x || minX > r.x + r.w || maxY < r.y || minY > r.y + r.h) return false;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

function Palette({ onDragStart }: { onDragStart: (item: (typeof paletteItems)[number]) => void }) {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card/40 overflow-y-auto">
      <div className="border-b border-border p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Node Library</div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search nodes" className="h-8 pl-8 text-xs" />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Drag a node type onto the canvas to add it to the workflow.
        </p>
      </div>
      <div className="space-y-1.5 p-3">
        {paletteItems.map((it) => {
          const s = kindStyles[it.kind];
          const Icon = ICONS[it.iconKey];
          return (
            <div
              key={it.label}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("application/x-node-kind", it.kind);
                onDragStart(it);
              }}
              className={cn(
                "flex w-full cursor-grab items-center gap-3 rounded-md border border-border bg-card p-2.5 text-left transition-colors active:cursor-grabbing",
                s.ring,
              )}
            >
              <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", s.iconBg)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{it.label}</div>
                <div className="truncate text-[11px] text-muted-foreground">{it.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Templates</div>
        <ul className="mt-3 space-y-2 text-xs">
          {["Lead qualification", "Ticket triage", "Invoice reminder", "Churn intervention"].map((t) => (
            <li key={t}>
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground hover:bg-muted hover:text-foreground">
                <Layers className="h-3.5 w-3.5" />
                {t}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

function SingleInspector({
  node,
  edgeCount,
  onChange,
  onDelete,
  onClose,
}: {
  node: WorkflowNode;
  edgeCount: number;
  onChange: (patch: Partial<WorkflowNode>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const s = kindStyles[node.kind];
  const Icon = ICONS[node.iconKey] ?? Zap;
  return (
    <>
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inspector</div>
          <button onClick={onClose} className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className={cn("grid h-9 w-9 place-items-center rounded-md", s.iconBg)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{node.title || "Untitled"}</div>
            <div className="text-[11px] text-muted-foreground">Node · {node.id}</div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 text-xs">
        <div>
          <Label htmlFor="node-title" className="mb-1.5 block font-medium text-muted-foreground">Title</Label>
          <Input id="node-title" value={node.title} onChange={(e) => onChange({ title: e.target.value })} className="h-8 text-xs" />
        </div>
        <div>
          <Label htmlFor="node-sub" className="mb-1.5 block font-medium text-muted-foreground">Description</Label>
          <Textarea id="node-sub" value={node.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })} className="min-h-[72px] text-xs" />
        </div>
        <div>
          <div className="mb-1.5 font-medium text-muted-foreground">Type</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(kindStyles) as NodeKind[]).map((k) => (
              <button
                key={k}
                onClick={() => onChange({ kind: k })}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-[11px] font-medium capitalize transition-colors",
                  node.kind === k ? kindStyles[k].badge : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {kindStyles[k].label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 font-medium text-muted-foreground">Position</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border bg-background px-2 py-1.5 font-mono">x: {Math.round(node.x)}</div>
            <div className="rounded-md border border-border bg-background px-2 py-1.5 font-mono">y: {Math.round(node.y)}</div>
          </div>
        </div>
        <div className="rounded-md border border-border bg-background p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Connections</span>
            <span className="font-mono font-medium text-foreground">{edgeCount}</span>
          </div>
        </div>

        {node.kind === "ai" && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-1.5 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">AI Suggestion</span>
            </div>
            <p className="mt-1.5 leading-relaxed text-muted-foreground">
              Add a fallback branch: escalate to a human when confidence &lt; 0.6. Historical data shows 22% improvement in CSAT.
            </p>
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete node
        </Button>
      </div>
    </>
  );
}

function MultiInspector({
  nodes,
  selectedNodes,
  selectedEdges,
  onKindChange,
  onDelete,
  onClose,
}: {
  nodes: WorkflowNode[];
  selectedNodes: WorkflowNode[];
  selectedEdges: WorkflowEdge[];
  onKindChange: (k: NodeKind) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const kinds = new Set(selectedNodes.map((n) => n.kind));
  const uniformKind = kinds.size === 1 ? (selectedNodes[0]?.kind ?? null) : null;
  const total = selectedNodes.length + selectedEdges.length;
  return (
    <>
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selection</div>
          <button onClick={onClose} className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
            <BoxSelect className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">{total} item{total === 1 ? "" : "s"} selected</div>
            <div className="text-[11px] text-muted-foreground">
              {selectedNodes.length} node{selectedNodes.length === 1 ? "" : "s"} · {selectedEdges.length} edge{selectedEdges.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 text-xs">
        {selectedNodes.length > 0 && (
          <>
            <div>
              <div className="mb-1.5 font-medium text-muted-foreground">Nodes</div>
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {selectedNodes.map((n) => {
                  const s = kindStyles[n.kind];
                  const Icon = ICONS[n.iconKey] ?? Zap;
                  return (
                    <li key={n.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                      <div className={cn("grid h-6 w-6 shrink-0 place-items-center rounded", s.iconBg)}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <span className="truncate text-foreground">{n.title || "Untitled"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <div className="mb-1.5 font-medium text-muted-foreground">
                Set type {uniformKind === null && <span className="text-[10px] normal-case">(mixed)</span>}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(kindStyles) as NodeKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => onKindChange(k)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-[11px] font-medium capitalize transition-colors",
                      uniformKind === k ? kindStyles[k].badge : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {kindStyles[k].label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {selectedEdges.length > 0 && (
          <div>
            <div className="mb-1.5 font-medium text-muted-foreground">Edges</div>
            <ul className="max-h-32 space-y-1 overflow-y-auto">
              {selectedEdges.map((e) => {
                const a = nodes.find((n) => n.id === e.from);
                const b = nodes.find((n) => n.id === e.to);
                return (
                  <li key={e.id} className="truncate rounded-md border border-border bg-background px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {a?.title ?? e.from} → {b?.title ?? e.to}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <Button variant="outline" size="sm" className="w-full text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete selection
        </Button>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Shift-click to add or remove items · drag on empty canvas to marquee-select · Delete removes selection · Esc clears it.
        </p>
      </div>
    </>
  );
}

function Inspector(props: {
  nodes: WorkflowNode[];
  selectedNodes: WorkflowNode[];
  selectedEdges: WorkflowEdge[];
  edgeCountForFirst: number;
  onChangeSingle: (patch: Partial<WorkflowNode>) => void;
  onBulkKind: (k: NodeKind) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { selectedNodes, selectedEdges } = props;
  const total = selectedNodes.length + selectedEdges.length;

  let body: React.ReactNode;
  if (total === 0) {
    body = (
      <>
        <div className="border-b border-border p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inspector</div>
        </div>
        <div className="p-6 text-center text-xs text-muted-foreground">
          <MousePointer2 className="mx-auto mb-3 h-6 w-6 opacity-40" />
          Select a node or edge to edit. Shift-click or drag on empty canvas to select multiple.
        </div>
      </>
    );
  } else if (selectedNodes.length === 1 && selectedEdges.length === 0) {
    body = (
      <SingleInspector
        node={selectedNodes[0]}
        edgeCount={props.edgeCountForFirst}
        onChange={props.onChangeSingle}
        onDelete={props.onDelete}
        onClose={props.onClose}
      />
    );
  } else {
    body = (
      <MultiInspector
        nodes={props.nodes}
        selectedNodes={selectedNodes}
        selectedEdges={selectedEdges}
        onKindChange={props.onBulkKind}
        onDelete={props.onDelete}
        onClose={props.onClose}
      />
    );
  }

  return (
    <aside className="hidden w-72 shrink-0 border-l border-border bg-card/40 xl:flex xl:flex-col overflow-y-auto">
      {body}
    </aside>
  );
}

interface CanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeIds: Set<string>;
  selectedEdgeIds: Set<string>;
  snapEnabled: boolean;
  onSelectNode: (id: string, additive: boolean) => void;
  onSelectEdge: (id: string, additive: boolean) => void;
  onClearSelection: () => void;
  onMarqueeSelect: (nodeIds: string[], edgeIds: string[], additive: boolean) => void;
  onSetNodePositions: (updates: Array<{ id: string; x: number; y: number }>) => void;
  onBeforePositionChange: (token?: string) => void;
  onDropCreate: (kind: NodeKind, x: number, y: number) => void;
  onConnect: (from: string, to: string) => void;
}

interface DragState {
  primaryId: string;
  mouseStart: { x: number; y: number };
  origin: Map<string, { x: number; y: number }>;
  pushed: boolean;
  token: string;
}

function Canvas({
  nodes,
  edges,
  selectedNodeIds,
  selectedEdgeIds,
  snapEnabled,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  onMarqueeSelect,
  onSetNodePositions,
  onBeforePositionChange,
  onDropCreate,
  onConnect,
}: CanvasProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [guides, setGuides] = useState<AlignGuide[]>([]);
  const [connecting, setConnecting] = useState<{ from: string; x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x: number; y: number; additive: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const getSurfacePoint = useCallback((clientX: number, clientY: number) => {
    const el = surfaceRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left + el.scrollLeft, y: clientY - r.top + el.scrollTop };
  }, []);

  useEffect(() => {
    if (!drag && !connecting && !marquee) return;
    const onMove = (e: MouseEvent) => {
      const p = getSurfacePoint(e.clientX, e.clientY);
      if (drag) {
        const rawDX = p.x - drag.mouseStart.x;
        const rawDY = p.y - drag.mouseStart.y;
        const primaryOrigin = drag.origin.get(drag.primaryId)!;
        const rawPrimary = {
          x: Math.max(0, primaryOrigin.x + rawDX),
          y: Math.max(0, primaryOrigin.y + rawDY),
        };
        const holdFree = e.altKey;
        let target = rawPrimary;
        let newGuides: AlignGuide[] = [];
        if (!holdFree) {
          const others = nodes.filter((n) => !drag.origin.has(n.id));
          const snap = computeSnap(rawPrimary, others, snapEnabled);
          target = { x: snap.x, y: snap.y };
          newGuides = snap.guides;
        }
        const effDX = target.x - primaryOrigin.x;
        const effDY = target.y - primaryOrigin.y;
        const updates = Array.from(drag.origin.entries()).map(([id, o]) => ({
          id,
          x: Math.max(0, o.x + effDX),
          y: Math.max(0, o.y + effDY),
        }));
        if (effDX !== 0 || effDY !== 0) {
          if (!drag.pushed) drag.pushed = true;
          onBeforePositionChange(drag.token);
        }
        onSetNodePositions(updates);
        setGuides(newGuides);
      } else if (connecting) {
        setConnecting({ ...connecting, x: p.x, y: p.y });
      } else if (marquee) {
        setMarquee({ ...marquee, x: p.x, y: p.y });
      }
    };
    const onUp = () => {
      if (marquee) {
        const rect = {
          x: Math.min(marquee.x0, marquee.x),
          y: Math.min(marquee.y0, marquee.y),
          w: Math.abs(marquee.x - marquee.x0),
          h: Math.abs(marquee.y - marquee.y0),
        };
        if (rect.w > 3 || rect.h > 3) {
          const nIds = nodes
            .filter((n) => rectsIntersect(rect, { x: n.x, y: n.y, w: NODE_W, h: NODE_H }))
            .map((n) => n.id);
          const eIds = edges
            .filter((e) => {
              const a = nodes.find((n) => n.id === e.from);
              const b = nodes.find((n) => n.id === e.to);
              if (!a || !b) return false;
              return segmentIntersectsRect(a.x + NODE_W, a.y + NODE_H / 2, b.x, b.y + NODE_H / 2, rect);
            })
            .map((e) => e.id);
          onMarqueeSelect(nIds, eIds, marquee.additive);
        } else if (!marquee.additive) {
          onClearSelection();
        }
      }
      setDrag(null);
      setGuides([]);
      setConnecting(null);
      setMarquee(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, connecting, marquee, nodes, edges, snapEnabled, getSurfacePoint, onSetNodePositions, onMarqueeSelect, onClearSelection, onBeforePositionChange]);


  const bounds = useMemo(() => {
    const maxX = Math.max(900, ...nodes.map((n) => n.x + NODE_W + 80));
    const maxY = Math.max(420, ...nodes.map((n) => n.y + NODE_H + 80));
    return { w: maxX, h: maxY };
  }, [nodes]);

  const marqueeRect = marquee && {
    x: Math.min(marquee.x0, marquee.x),
    y: Math.min(marquee.y0, marquee.y),
    w: Math.abs(marquee.x - marquee.x0),
    h: Math.abs(marquee.y - marquee.y0),
  };

  return (
    <div
      ref={surfaceRef}
      className="relative flex-1 overflow-auto"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-node-kind")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dragOver) setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const kind = e.dataTransfer.getData("application/x-node-kind") as NodeKind;
        if (!kind) return;
        const p = getSurfacePoint(e.clientX, e.clientY);
        onDropCreate(kind, Math.max(0, p.x - NODE_W / 2), Math.max(0, p.y - NODE_H / 2));
      }}
    >
      <div
        data-canvas-bg="1"
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).dataset.canvasBg !== "1") return;
          const p = getSurfacePoint(e.clientX, e.clientY);
          setMarquee({ x0: p.x, y0: p.y, x: p.x, y: p.y, additive: e.shiftKey || e.metaKey || e.ctrlKey });
        }}
        className={cn("relative min-h-full min-w-full transition-colors", dragOver && "bg-primary/5")}
        style={{
          backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
          minWidth: `${bounds.w}px`,
          minHeight: `${bounds.h}px`,
        }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          style={{ minWidth: bounds.w, minHeight: bounds.h, pointerEvents: "none" }}
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--color-primary)" />
            </marker>
            <marker id="arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--color-primary)" />
            </marker>
          </defs>
          <g style={{ pointerEvents: "auto" }}>
            {edges.map((e) => {
              const a = nodes.find((n) => n.id === e.from);
              const b = nodes.find((n) => n.id === e.to);
              if (!a || !b) return null;
              const ax = a.x + NODE_W;
              const ay = a.y + NODE_H / 2;
              const bx = b.x;
              const by = b.y + NODE_H / 2;
              const selected = selectedEdgeIds.has(e.id);
              return (
                <g
                  key={e.id}
                  className="cursor-pointer"
                  onMouseDown={(evt) => {
                    evt.stopPropagation();
                    onSelectEdge(e.id, evt.shiftKey || evt.metaKey || evt.ctrlKey);
                  }}
                >
                  <path d={edgePath(ax, ay, bx, by)} fill="none" stroke="transparent" strokeWidth={14} />
                  <path
                    d={edgePath(ax, ay, bx, by)}
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth={selected ? 2.5 : 1.8}
                    strokeOpacity={selected ? 1 : 0.55}
                    markerEnd="url(#arrow)"
                    className="transition-all"
                  />
                </g>
              );
            })}
          </g>
          {connecting && (() => {
            const a = nodes.find((n) => n.id === connecting.from);
            if (!a) return null;
            const ax = a.x + NODE_W;
            const ay = a.y + NODE_H / 2;
            return (
              <path d={edgePath(ax, ay, connecting.x, connecting.y)} fill="none" stroke="var(--color-primary)" strokeWidth={1.8} strokeDasharray="4 4" />
            );
          })()}
          {marqueeRect && (marqueeRect.w > 1 || marqueeRect.h > 1) && (
            <rect
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.w}
              height={marqueeRect.h}
              fill="var(--color-primary)"
              fillOpacity={0.08}
              stroke="var(--color-primary)"
              strokeOpacity={0.6}
              strokeDasharray="4 3"
            />
          )}
          {guides.map((g, i) =>
            g.orientation === "v" ? (
              <line
                key={`gv-${i}`}
                x1={g.pos}
                x2={g.pos}
                y1={g.span[0] - 8}
                y2={g.span[1] + 8}
                stroke="var(--color-primary)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ) : (
              <line
                key={`gh-${i}`}
                x1={g.span[0] - 8}
                x2={g.span[1] + 8}
                y1={g.pos}
                y2={g.pos}
                stroke="var(--color-primary)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ),
          )}
        </svg>


        {nodes.map((n) => {
          const s = kindStyles[n.kind];
          const Icon = ICONS[n.iconKey] ?? Zap;
          const selected = selectedNodeIds.has(n.id);
          return (
            <div
              key={n.id}
              style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).dataset.port) return;
                e.stopPropagation();
                const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                onSelectNode(n.id, additive);
                const p = getSurfacePoint(e.clientX, e.clientY);
                // Build origin snapshot: everything currently selected + this node.
                const origin = new Map<string, { x: number; y: number }>();
                nodes.forEach((nn) => {
                  if (selectedNodeIds.has(nn.id) || nn.id === n.id) {
                    origin.set(nn.id, { x: nn.x, y: nn.y });
                  }
                });
                setDrag({ primaryId: n.id, mouseStart: { x: p.x, y: p.y }, origin, pushed: false, token: `drag:${Date.now()}:${Math.random().toString(36).slice(2, 8)}` });
              }}
              className={cn(
                "group absolute cursor-grab rounded-lg border bg-card p-3 shadow-sm transition-all active:cursor-grabbing",
                "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-primary ring-2 ring-primary/30" : "border-border",
                s.ring,
              )}
              tabIndex={0}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md", s.iconBg)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", s.badge)}>
                      {s.label}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-foreground">{n.title}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{n.subtitle}</div>
                </div>
              </div>
              <span
                data-port="in"
                onMouseUp={(e) => {
                  e.stopPropagation();
                  if (connecting && connecting.from !== n.id) {
                    onConnect(connecting.from, n.id);
                    setConnecting(null);
                  }
                }}
                className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-background bg-muted-foreground/50 hover:bg-primary hover:scale-125 transition-transform cursor-crosshair"
              />
              <span
                data-port="out"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const p = getSurfacePoint(e.clientX, e.clientY);
                  setConnecting({ from: n.id, x: p.x, y: p.y });
                }}
                className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-background bg-primary hover:scale-125 transition-transform cursor-crosshair"
              />
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none sticky bottom-4 mx-auto w-fit rounded-full border border-border bg-card/95 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        <span className="inline-flex items-center gap-1.5">
          <MousePointer2 className="h-3 w-3" />
          Shift-click multi-select · Marquee-drag · Nodes snap to grid & align · Hold Alt for free move
        </span>
      </div>
    </div>
  );
}

function WorkflowsPage() {
  const loading = useSimulatedLoading(500);
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialNodes);
  const [edges, setEdges] = useState<WorkflowEdge[]>(initialEdges);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set(["a1"]));
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(() => new Set());

  const selectedNodes = useMemo(() => nodes.filter((n) => selectedNodeIds.has(n.id)), [nodes, selectedNodeIds]);
  const selectedEdges = useMemo(() => edges.filter((e) => selectedEdgeIds.has(e.id)), [edges, selectedEdgeIds]);

  const edgeCountForFirst = useMemo(() => {
    if (selectedNodes.length !== 1) return 0;
    const id = selectedNodes[0].id;
    return edges.filter((e) => e.from === id || e.to === id).length;
  }, [edges, selectedNodes]);

  const selectNode = useCallback((id: string, additive: boolean) => {
    setSelectedEdgeIds((prev) => (additive ? prev : new Set()));
    setSelectedNodeIds((prev) => {
      if (!additive) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectEdge = useCallback((id: string, additive: boolean) => {
    setSelectedNodeIds((prev) => (additive ? prev : new Set()));
    setSelectedEdgeIds((prev) => {
      if (!additive) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNodeIds(new Set());
    setSelectedEdgeIds(new Set());
  }, []);

  const marqueeSelect = useCallback((nIds: string[], eIds: string[], additive: boolean) => {
    setSelectedNodeIds((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      nIds.forEach((id) => next.add(id));
      return next;
    });
    setSelectedEdgeIds((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      eIds.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const [snapEnabled, setSnapEnabled] = useState(true);

  // Undo/redo for node + edge mutations (drag, nudge, align, distribute,
  // create, delete, paste, duplicate, connect).
  type Snapshot = { nodes: WorkflowNode[]; edges: WorkflowEdge[] };
  const [historyPast, setHistoryPast] = useState<Snapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<Snapshot[]>([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  const snapshot = useCallback(
    (): Snapshot => ({
      nodes: nodesRef.current.map((n) => ({ ...n })),
      edges: edgesRef.current.map((e) => ({ ...e })),
    }),
    [],
  );
  // Coalescing: repeated calls sharing the same `token` within COALESCE_MS
  // collapse into the single history entry captured on the first call
  // (e.g. an entire drag or a burst of arrow-key nudges = one undo step).
  // Pass no token for discrete actions (align, distribute, paste, delete).
  const COALESCE_MS = 600;
  const lastPushRef = useRef<{ token: string; time: number } | null>(null);
  const pushHistory = useCallback((token?: string) => {
    const now = Date.now();
    if (token) {
      const last = lastPushRef.current;
      if (last && last.token === token && now - last.time < COALESCE_MS) {
        lastPushRef.current = { token, time: now };
        return;
      }
      lastPushRef.current = { token, time: now };
    } else {
      lastPushRef.current = null;
    }
    setHistoryPast((p) => {
      const next = [...p, snapshot()];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
    setHistoryFuture([]);
  }, [snapshot]);
  const undo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const prev = past[past.length - 1];
      setHistoryFuture((f) => [...f, snapshot()]);
      setNodes(prev.nodes);
      setEdges(prev.edges);
      const nIds = new Set(prev.nodes.map((n) => n.id));
      const eIds = new Set(prev.edges.map((e) => e.id));
      setSelectedNodeIds((s) => new Set([...s].filter((id) => nIds.has(id))));
      setSelectedEdgeIds((s) => new Set([...s].filter((id) => eIds.has(id))));
      lastPushRef.current = null;
      return past.slice(0, -1);
    });
  }, [snapshot]);
  const redo = useCallback(() => {
    setHistoryFuture((fut) => {
      if (fut.length === 0) return fut;
      const next = fut[fut.length - 1];
      setHistoryPast((p) => [...p, snapshot()]);
      setNodes(next.nodes);
      setEdges(next.edges);
      const nIds = new Set(next.nodes.map((n) => n.id));
      const eIds = new Set(next.edges.map((e) => e.id));
      setSelectedNodeIds((s) => new Set([...s].filter((id) => nIds.has(id))));
      setSelectedEdgeIds((s) => new Set([...s].filter((id) => eIds.has(id))));
      lastPushRef.current = null;
      return fut.slice(0, -1);
    });
  }, [snapshot]);

  const setNodePositions = useCallback((updates: Array<{ id: string; x: number; y: number }>) => {
    if (updates.length === 0) return;
    const map = new Map(updates.map((u) => [u.id, u]));
    setNodes((ns) => ns.map((n) => (map.has(n.id) ? { ...n, x: map.get(n.id)!.x, y: map.get(n.id)!.y } : n)));
  }, []);

  const handleDropCreate = useCallback(
    (kind: NodeKind, x: number, y: number) => {
      const tpl = paletteItems.find((p) => p.kind === kind)!;
      const id = nextId(kind[0]);
      const snappedX = snapEnabled ? snapToGrid(x) : x;
      const snappedY = snapEnabled ? snapToGrid(y) : y;
      const node: WorkflowNode = {
        id,
        kind,
        title: tpl.title,
        subtitle: tpl.subtitle,
        iconKey: tpl.iconKey,
        x: Math.max(0, snappedX),
        y: Math.max(0, snappedY),
      };
      pushHistory();
      setNodes((ns) => [...ns, node]);
      setSelectedNodeIds(new Set([id]));
      setSelectedEdgeIds(new Set());
    },
    [snapEnabled, pushHistory],
  );

  const handleConnect = useCallback((from: string, to: string) => {
    if (edgesRef.current.some((e) => e.from === from && e.to === to)) return;
    pushHistory();
    setEdges((es) => [...es, { id: nextId("e"), from, to }]);
  }, [pushHistory]);

  const handleChangeSingle = useCallback(
    (patch: Partial<WorkflowNode>) => {
      if (selectedNodes.length !== 1) return;
      const id = selectedNodes[0].id;
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    },
    [selectedNodes],
  );

  const handleBulkKind = useCallback(
    (k: NodeKind) => {
      setNodes((ns) => ns.map((n) => (selectedNodeIds.has(n.id) ? { ...n, kind: k } : n)));
    },
    [selectedNodeIds],
  );

  const deleteSelection = useCallback(() => {
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return;
    pushHistory();
    setNodes((ns) => ns.filter((n) => !selectedNodeIds.has(n.id)));
    setEdges((es) =>
      es.filter(
        (e) =>
          !selectedEdgeIds.has(e.id) && !selectedNodeIds.has(e.from) && !selectedNodeIds.has(e.to),
      ),
    );
    setSelectedNodeIds(new Set());
    setSelectedEdgeIds(new Set());
  }, [selectedNodeIds, selectedEdgeIds, pushHistory]);

  // Clipboard: captures node snapshots + edges among them at copy time.
  const [clipboard, setClipboard] = useState<{ nodes: WorkflowNode[]; edges: Array<{ from: string; to: string }> } | null>(null);
  const pasteCountRef = useRef(0);

  const copySelection = useCallback(() => {
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return;
    const copiedNodes = nodes.filter((n) => selectedNodeIds.has(n.id)).map((n) => ({ ...n }));
    const copiedNodeIdSet = new Set(copiedNodes.map((n) => n.id));
    // Include explicitly-selected edges plus any edges internal to the copied node set.
    const copiedEdges = edges
      .filter(
        (e) =>
          selectedEdgeIds.has(e.id) ||
          (copiedNodeIdSet.has(e.from) && copiedNodeIdSet.has(e.to)),
      )
      .filter((e) => copiedNodeIdSet.has(e.from) && copiedNodeIdSet.has(e.to))
      .map((e) => ({ from: e.from, to: e.to }));
    setClipboard({ nodes: copiedNodes, edges: copiedEdges });
    pasteCountRef.current = 0;
  }, [nodes, edges, selectedNodeIds, selectedEdgeIds]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard || clipboard.nodes.length === 0) return;
    pasteCountRef.current += 1;
    const offset = 32 * pasteCountRef.current;
    const idMap = new Map<string, string>();
    const newNodes: WorkflowNode[] = clipboard.nodes.map((n) => {
      const id = nextId(n.kind[0]);
      idMap.set(n.id, id);
      return { ...n, id, x: n.x + offset, y: n.y + offset };
    });
    const newEdges: WorkflowEdge[] = clipboard.edges.map((e) => ({
      id: nextId("e"),
      from: idMap.get(e.from)!,
      to: idMap.get(e.to)!,
    }));
    pushHistory();
    setNodes((ns) => [...ns, ...newNodes]);
    setEdges((es) => [...es, ...newEdges]);
    setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
    setSelectedEdgeIds(new Set(newEdges.map((e) => e.id)));
  }, [clipboard, pushHistory]);

  const duplicateSelection = useCallback(() => {
    if (selectedNodeIds.size === 0) return;
    const copiedNodes = nodes.filter((n) => selectedNodeIds.has(n.id));
    const copiedIdSet = new Set(copiedNodes.map((n) => n.id));
    const copiedEdges = edges
      .filter(
        (e) =>
          (selectedEdgeIds.has(e.id) || (copiedIdSet.has(e.from) && copiedIdSet.has(e.to))) &&
          copiedIdSet.has(e.from) &&
          copiedIdSet.has(e.to),
      )
      .map((e) => ({ from: e.from, to: e.to }));
    const idMap = new Map<string, string>();
    const newNodes: WorkflowNode[] = copiedNodes.map((n) => {
      const id = nextId(n.kind[0]);
      idMap.set(n.id, id);
      return { ...n, id, x: n.x + 32, y: n.y + 32 };
    });
    const newEdges: WorkflowEdge[] = copiedEdges.map((e) => ({
      id: nextId("e"),
      from: idMap.get(e.from)!,
      to: idMap.get(e.to)!,
    }));
    pushHistory();
    setNodes((ns) => [...ns, ...newNodes]);
    setEdges((es) => [...es, ...newEdges]);
    setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
    setSelectedEdgeIds(new Set(newEdges.map((e) => e.id)));
  }, [nodes, edges, selectedNodeIds, selectedEdgeIds, pushHistory]);

  type AlignMode = "left" | "center-h" | "right" | "top" | "center-v" | "bottom";
  const alignSelection = useCallback(
    (mode: AlignMode) => {
      if (selectedNodeIds.size < 2) return;
      pushHistory();
      const sel = nodes.filter((n) => selectedNodeIds.has(n.id));
      let target: number;
      if (mode === "left") target = Math.min(...sel.map((n) => n.x));
      else if (mode === "right") target = Math.max(...sel.map((n) => n.x + NODE_W));
      else if (mode === "center-h") {
        const min = Math.min(...sel.map((n) => n.x));
        const max = Math.max(...sel.map((n) => n.x + NODE_W));
        target = (min + max) / 2;
      } else if (mode === "top") target = Math.min(...sel.map((n) => n.y));
      else if (mode === "bottom") target = Math.max(...sel.map((n) => n.y + NODE_H));
      else {
        const min = Math.min(...sel.map((n) => n.y));
        const max = Math.max(...sel.map((n) => n.y + NODE_H));
        target = (min + max) / 2;
      }
      setNodes((ns) =>
        ns.map((n) => {
          if (!selectedNodeIds.has(n.id)) return n;
          if (mode === "left") return { ...n, x: target };
          if (mode === "right") return { ...n, x: target - NODE_W };
          if (mode === "center-h") return { ...n, x: target - NODE_W / 2 };
          if (mode === "top") return { ...n, y: target };
          if (mode === "bottom") return { ...n, y: target - NODE_H };
          return { ...n, y: target - NODE_H / 2 };
        }),
      );
    },
    [nodes, selectedNodeIds, pushHistory],
  );

  const distributeSelection = useCallback(
    (axis: "h" | "v") => {
      if (selectedNodeIds.size < 3) return;
      pushHistory();
      const sel = nodes
        .filter((n) => selectedNodeIds.has(n.id))
        .slice()
        .sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
      const first = sel[0];
      const last = sel[sel.length - 1];
      const firstCenter = axis === "h" ? first.x + NODE_W / 2 : first.y + NODE_H / 2;
      const lastCenter = axis === "h" ? last.x + NODE_W / 2 : last.y + NODE_H / 2;
      const step = (lastCenter - firstCenter) / (sel.length - 1);
      const positions = new Map<string, number>();
      sel.forEach((n, i) => {
        if (i === 0 || i === sel.length - 1) return;
        const center = firstCenter + step * i;
        positions.set(n.id, axis === "h" ? center - NODE_W / 2 : center - NODE_H / 2);
      });
      setNodes((ns) =>
        ns.map((n) => {
          const p = positions.get(n.id);
          if (p === undefined) return n;
          return axis === "h" ? { ...n, x: p } : { ...n, y: p };
        }),
      );
    },
    [nodes, selectedNodeIds, pushHistory],
  );

  // Keyboard: Delete/Backspace to remove, Esc to clear, Cmd/Ctrl+C/V/D for copy/paste/duplicate,
  // Alt+L/C/R (+ T/M/B) to align, Alt+H/V to distribute.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && ((e.key === "z" || e.key === "Z") && e.shiftKey || e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && (e.key === "c" || e.key === "C")) {
        if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return;
        e.preventDefault();
        copySelection();
      } else if (mod && (e.key === "v" || e.key === "V")) {
        if (!clipboard) return;
        e.preventDefault();
        pasteClipboard();
      } else if (mod && (e.key === "d" || e.key === "D")) {
        if (selectedNodeIds.size === 0) return;
        e.preventDefault();
        duplicateSelection();
      } else if (e.altKey && !mod && !e.shiftKey) {
        const k = e.key.toLowerCase();
        const alignMap: Record<string, AlignMode> = {
          l: "left",
          c: "center-h",
          r: "right",
          t: "top",
          m: "center-v",
          b: "bottom",
        };
        if (k in alignMap) {
          if (selectedNodeIds.size < 2) return;
          e.preventDefault();
          alignSelection(alignMap[k]);
          return;
        }
        if (k === "h" || k === "v") {
          if (selectedNodeIds.size < 3) return;
          e.preventDefault();
          distributeSelection(k);
          return;
        }
      } else if (e.key.startsWith("Arrow")) {
        if (selectedNodeIds.size === 0) return;
        e.preventDefault();
        // Step: Alt = 1px fine · default = 1 grid unit · Shift = 10× (snap) or 10px (fine).
        const fine = e.altKey;
        const base = fine ? 1 : GRID;
        const step = e.shiftKey ? base * 10 : base;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else if (e.key === "ArrowUp") dy = -step;
        else if (e.key === "ArrowDown") dy = step;
        if (dx === 0 && dy === 0) return;
        pushHistory("nudge");
        setNodes((ns) =>
          ns.map((n) => {
            if (!selectedNodeIds.has(n.id)) return n;
            let nx = Math.max(0, n.x + dx);
            let ny = Math.max(0, n.y + dy);
            // Respect grid snapping when enabled and not in fine-nudge mode.
            if (snapEnabled && !fine) {
              if (dx !== 0) nx = snapToGrid(nx);
              if (dy !== 0) ny = snapToGrid(ny);
            }
            return { ...n, x: nx, y: ny };
          }),
        );
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return;
        e.preventDefault();
        deleteSelection();
      } else if (e.key === "Escape") {
        clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedNodeIds, selectedEdgeIds, clipboard, snapEnabled, copySelection, pasteClipboard, duplicateSelection, deleteSelection, clearSelection, alignSelection, distributeSelection, pushHistory, undo, redo]);

  const addBlankNode = () => handleDropCreate("action", 120, 120);
  const selectionCount = selectedNodeIds.size + selectedEdgeIds.size;
  const clipboardCount = clipboard ? clipboard.nodes.length : 0;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <PageHeader
        eyebrow="Automation"
        title="Visual Workflow Builder"
        description="Compose triggers, AI steps, and actions on an infinite canvas."
        actions={
          <>
            <div className="flex h-9 items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={undo}
                      disabled={historyPast.length === 0}
                      aria-label="Undo"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  <p>{historyPast.length === 0 ? "Nothing to undo" : "Undo last action (⌘Z)"}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={redo}
                      disabled={historyFuture.length === 0}
                      aria-label="Redo"
                    >
                      <Redo2 className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={6}>
                  <p>{historyFuture.length === 0 ? "Nothing to redo" : "Redo last action (⌘⇧Z)"}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            {selectionCount > 0 && (
              <>
                <Button variant="outline" size="sm" className="h-9" onClick={copySelection} title="Copy (⌘C)">
                  <Copy className="mr-2 h-3.5 w-3.5" /> Copy ({selectionCount})
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-destructive hover:text-destructive" onClick={deleteSelection} title="Delete (⌫)">
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                </Button>
              </>
            )}
            {selectedNodeIds.size >= 2 && (
              <div className="flex h-9 items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => alignSelection("left")}
                  title="Align left (Alt+L)"
                  aria-label="Align left"
                >
                  <AlignLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => alignSelection("center-h")}
                  title="Align horizontal center (Alt+C)"
                  aria-label="Align horizontal center"
                >
                  <AlignCenter className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => alignSelection("right")}
                  title="Align right (Alt+R)"
                  aria-label="Align right"
                >
                  <AlignRight className="h-3.5 w-3.5" />
                </Button>
                <div className="mx-0.5 h-5 w-px bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => distributeSelection("h")}
                  disabled={selectedNodeIds.size < 3}
                  title="Distribute horizontally (Alt+H)"
                  aria-label="Distribute horizontally"
                >
                  <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => distributeSelection("v")}
                  disabled={selectedNodeIds.size < 3}
                  title="Distribute vertically (Alt+V)"
                  aria-label="Distribute vertically"
                >
                  <AlignVerticalDistributeCenter className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={pasteClipboard}
              disabled={!clipboard}
              title="Paste (⌘V)"
            >
              <ClipboardPaste className="mr-2 h-3.5 w-3.5" />
              Paste{clipboardCount ? ` (${clipboardCount})` : ""}
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={addBlankNode}>
              <Plus className="mr-2 h-3.5 w-3.5" /> New node
            </Button>
            <Button
              variant={snapEnabled ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={() => setSnapEnabled((s) => !s)}
              title="Toggle grid snap (hold Alt to temporarily disable)"
            >
              <Magnet className="mr-2 h-3.5 w-3.5" /> Snap {snapEnabled ? "on" : "off"}
            </Button>
            <Button variant="outline" size="sm" className="h-9">
              <Save className="mr-2 h-3.5 w-3.5" /> Save
            </Button>
            <Button size="sm" className="h-9">
              <Play className="mr-2 h-3.5 w-3.5" /> Run
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <Palette onDragStart={clearSelection} />
        {loading ? (
          <div className="flex-1 p-6">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        ) : (
          <Canvas
            nodes={nodes}
            edges={edges}
            selectedNodeIds={selectedNodeIds}
            selectedEdgeIds={selectedEdgeIds}
            onSelectNode={selectNode}
            onSelectEdge={selectEdge}
            onClearSelection={clearSelection}
            onMarqueeSelect={marqueeSelect}
            snapEnabled={snapEnabled}
            onSetNodePositions={setNodePositions}
            onBeforePositionChange={pushHistory}
            onDropCreate={handleDropCreate}
            onConnect={handleConnect}
          />
        )}
        <Inspector
          nodes={nodes}
          selectedNodes={selectedNodes}
          selectedEdges={selectedEdges}
          edgeCountForFirst={edgeCountForFirst}
          onChangeSingle={handleChangeSingle}
          onBulkKind={handleBulkKind}
          onDelete={deleteSelection}
          onClose={clearSelection}
        />
      </div>
    </div>
  </TooltipProvider>
);
}
