/**
 * Frontend observability: Sentry + PostHog.
 *
 * All DSNs / keys come from Vite env vars (VITE_* — public by design, safe
 * for the browser bundle). If any var is missing, that provider is a no-op
 * so local dev without keys still works.
 */
import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

let initialized = false;

export function initObservability() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: import.meta.env.MODE,
      release: import.meta.env.VITE_APP_RELEASE as string | undefined,
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_RATE ?? 0.1),
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
      ],
    });
  }

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const posthogHost =
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      capture_pageview: true,
      capture_pageleave: true,
      person_profiles: "identified_only",
    });
  }
}

/** Identify the current user across both providers. Call after login. */
export function identifyUser(userId: string, traits: Record<string, unknown> = {}) {
  Sentry.setUser({ id: userId, ...(traits as Record<string, string>) });
  if (posthog.__loaded) posthog.identify(userId, traits);
}

/** Clear identity on sign-out. */
export function resetIdentity() {
  Sentry.setUser(null);
  if (posthog.__loaded) posthog.reset();
}

/** Capture a product-analytics event. Safe to call before init. */
export function captureEvent(name: string, properties: Record<string, unknown> = {}) {
  if (posthog.__loaded) posthog.capture(name, properties);
}

/** Report a caught error to Sentry with optional context. */
export function reportError(err: unknown, context: Record<string, unknown> = {}) {
  Sentry.captureException(err, { extra: context });
}

export { Sentry, posthog };
