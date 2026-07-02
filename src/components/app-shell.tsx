import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Workflow,
  Plug,
  Sparkles,
  Search,
  Settings,
  ChevronsLeft,
  Command,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationsBell } from "@/components/notifications-panel";
import { useAuthStore } from "@/stores/auth-store";

const nav = [
  { to: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { to: "/workflows", label: "Workflow Builder", icon: Workflow },
  { to: "/integrations", label: "Integration Hub", icon: Plug },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside
        className={cn(
          "sticky top-0 h-screen shrink-0 border-r border-border bg-sidebar transition-all duration-200",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">Nexus BI</div>
              <div className="truncate text-[11px] text-muted-foreground">Enterprise · v4.2</div>
            </div>
          )}
        </div>

        <nav className="flex flex-col gap-0.5 p-2">
          {nav.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t border-border p-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronsLeft
              className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")}
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-6 backdrop-blur">
          <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search workflows, integrations, metrics…"
                className="h-9 pl-9 pr-16 bg-muted/50 border-border"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground">
                <Command className="h-3 w-3" />K
              </kbd>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const letters = local.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || "??").toUpperCase();
}

function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) {
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link to="/login">Sign in</Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="ml-2 flex items-center gap-2 rounded-md border-l border-border pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-chart-1 to-chart-5 text-xs font-semibold text-primary-foreground">
            {initialsFromEmail(user.email)}
          </div>
          <div className="hidden text-left text-xs sm:block">
            <div className="font-medium leading-tight">{user.email}</div>
            <div className="capitalize text-muted-foreground">{user.role}</div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-xs text-muted-foreground">Signed in as</div>
          <div className="truncate text-sm font-medium">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
