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
export async function logError(ctx: ErrorContext, error: unknown): Promise<void> {
  // Always log to console first for immediate visibility
  console.error(`[${ctx.operation}]`, error, ctx.additionalContext || '');

  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const { data: { user } } = await supabase.auth.getUser();

    // Silently skip if not authenticated — can't log anonymously due to RLS
    if (!user) return;

    await (supabase as any).from('app_error_logs').insert({
      organization_id: ctx.organizationId || null,
      user_id: user.id,
      page_path: ctx.page || (typeof window !== 'undefined' ? window.location.pathname : null),
      operation: ctx.operation,
      error_message: err.message.slice(0, 2000),
      error_stack: err.stack?.slice(0, 5000) || null,
      error_code: (err as any).code || null,
      browser_info: typeof window !== 'undefined' ? {
        userAgent: navigator.userAgent.slice(0, 500),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      } : null,
      additional_context: ctx.additionalContext || null,
    });
  } catch (logErr) {
    // Swallow any logging failure — the app must not break because logging failed
    console.warn('errorLogger: failed to persist error', logErr);
  }
}
