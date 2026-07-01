import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Sparkles, Workflow, Bot, Webhook } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nexus BI — AI Workflow & Business Intelligence" },
      { name: "description", content: "Nexus BI unifies your operational data, surfaces anomalies before they become outages, and executes workflows across your stack." },
      { property: "og:title", content: "Nexus BI — AI Workflow & Business Intelligence" },
      { property: "og:description", content: "Nexus BI unifies your operational data, surfaces anomalies before they become outages, and executes workflows across your stack." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Nexus BI</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <Link to="/dashboard" className="hover:text-foreground">
              Platform
            </Link>
            <Link to="/workflows" className="hover:text-foreground">
              Workflows
            </Link>
            <Link to="/integrations" className="hover:text-foreground">
              Integrations
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/dashboard">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/dashboard">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-4 pt-20 pb-24 sm:px-6 lg:px-8">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Enterprise AI Workflow Automation
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Stop Guessing. Start Automating Intelligence.
            </h1>
            <h2 className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Nexus BI unifies your operational data, surfaces anomalies before they become outages, and executes workflows across your stack—so your team moves from reactive reporting to autonomous decision-making.
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/dashboard">Request a Demo</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/dashboard">See the Platform</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t border-border px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Built for operational velocity
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
                Everything you need to close the loop between data, insight, and action.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <FeatureCard
                icon={Workflow}
                title="Visual Workflow Builder"
                description="Design complex automation with a drag-and-drop canvas. Connect triggers, AI steps, logic branches, and actions without writing code."
              />
              <FeatureCard
                icon={Bot}
                title="Agentic AI Insights"
                description="AI agents monitor your metrics in real time, detect anomalies, and recommend validated actions—no black-box predictions."
              />
              <FeatureCard
                icon={Webhook}
                title="Dynamic Webhook Engine"
                description="Ingest events from any third-party system with HMAC-verified webhooks and flexible mapping rules that keep your data in sync."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="font-medium">Nexus BI</span>
          </div>
          <p>© 2026 Nexus BI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-primary/40">
      <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </article>
  );
}
