import * as Sentry from "@sentry/node";
import type { Env } from "../config/env.js";

/**
 * Initialize Sentry error reporting client
 * Only initializes if SENTRY_DSN is provided
 */
export function initializeSentry(env: Env): void {
  if (!env.SENTRY_DSN) {
    console.log("[sentry] No SENTRY_DSN configured, error reporting disabled");
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Capture unhandled exceptions and rejections
    integrations: [
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection(),
    ],
    // Attach stack trace to all messages
    attachStacktrace: true,
    // Release version (set during build)
    release: process.env.SENTRY_RELEASE || "unknown",
  });

  console.log(`[sentry] Initialized for environment: ${env.NODE_ENV}`);
}

/**
 * Capture exception and send to Sentry with context
 */
export function captureException(
  error: Error | unknown,
  context?: Record<string, any>
): void {
  if (context) {
    Sentry.captureException(error, { contexts: { custom: context } });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Capture message and send to Sentry
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = "info"
): void {
  Sentry.captureMessage(message, level);
}

/**
 * Set user context for Sentry
 */
export function setUser(userId: string | null): void {
  if (userId) {
    Sentry.setUser({ id: userId });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Add breadcrumb (audit trail) for Sentry
 */
export function addBreadcrumb(
  category: string,
  message: string,
  level: Sentry.SeverityLevel = "info"
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    level,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Close Sentry client and flush pending events
 */
export async function closeSentry(timeout: number = 2000): Promise<void> {
  await Sentry.close(timeout);
}
