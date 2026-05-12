import { supabase } from "@/integrations/supabase/client";

export interface ErrorContext {
  operation: string;
  page?: string;
  organizationId?: string;
  additionalContext?: Record<string, any>;
}

/**
 * Logs an error to both browser console and the app_error_logs table.
 * Fire-and-forget — never throws, never blocks the caller.
 */
/**
 * Best-effort extraction of a human-readable message + structured fields from
 * any thrown value. Supabase / PostgREST errors are plain objects with
 * `message`, `details`, `hint`, `code` — `String(obj)` collapses them to
 * "[object Object]", which is what users were seeing in toasts and what was
 * being persisted to `app_error_logs`.
 */
export function extractErrorInfo(error: unknown): {
  message: string;
  stack: string | null;
  code: string | null;
  details: Record<string, any> | null;
} {
  if (error instanceof Error) {
    const anyErr = error as any;
    return {
      message: error.message || 'Unknown error',
      stack: error.stack || null,
      code: anyErr.code || null,
      details: (anyErr.details || anyErr.hint) ? { details: anyErr.details, hint: anyErr.hint } : null,
    };
  }
  if (error && typeof error === 'object') {
    const e = error as any;
    const parts = [e.message, e.details, e.hint].filter(Boolean);
    let message = parts.join(' — ');
    if (!message) {
      try { message = JSON.stringify(error).slice(0, 1000); } catch { message = '[unserializable error]'; }
    }
    return {
      message,
      stack: e.stack || null,
      code: e.code || null,
      details: { details: e.details ?? null, hint: e.hint ?? null, raw: (() => { try { return JSON.parse(JSON.stringify(error)); } catch { return null; } })() },
    };
  }
  return { message: String(error ?? 'Unknown error'), stack: null, code: null, details: null };
}

export async function logError(ctx: ErrorContext, error: unknown): Promise<void> {
  const info = extractErrorInfo(error);
  // Always log to console first for immediate visibility
  console.error(`[${ctx.operation}]`, info.message, error, ctx.additionalContext || '');

  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Silently skip if not authenticated — can't log anonymously due to RLS
    if (!user) return;

    await (supabase as any).from('app_error_logs').insert({
      organization_id: ctx.organizationId || null,
      user_id: user.id,
      page_path: ctx.page || (typeof window !== 'undefined' ? window.location.pathname : null),
      operation: ctx.operation,
      error_message: (info.message || 'Unknown error').slice(0, 2000),
      error_stack: info.stack?.slice(0, 5000) || null,
      error_code: info.code,
      browser_info: typeof window !== 'undefined' ? {
        userAgent: navigator.userAgent.slice(0, 500),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      } : null,
      additional_context: { ...(ctx.additionalContext || {}), ...(info.details ? { error_details: info.details } : {}) },
    });
  } catch (logErr) {
    // Swallow any logging failure — the app must not break because logging failed
    console.warn('errorLogger: failed to persist error', logErr);
  }
}
