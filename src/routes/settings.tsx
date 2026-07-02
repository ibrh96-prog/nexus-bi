import { createFileRoute } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useAuthStore } from "@/stores/auth-store";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Settings — Nexus BI" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { ready } = useRequireAuth();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!ready || !user) return null;

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Your account details for this Nexus BI workspace."
      />

      <div className="max-w-xl space-y-6 p-6">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Profile</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium text-foreground">{user.email}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium capitalize text-foreground">{user.role}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Role changes are managed by an admin. Contact yours to change access levels.
          </p>
        </section>

        <Button variant="outline" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
