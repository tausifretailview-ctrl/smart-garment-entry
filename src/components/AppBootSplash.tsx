/**
 * Branded full-screen loader for first paint / auth bootstrap.
 * Matches index.html splash so Windows app does not flash a white page + tiny spinner.
 */
export function AppBootSplash({ message = "Loading…" }: { message?: string }) {
  return (
    <div
      className="fixed inset-0 z-[99998] flex flex-col items-center justify-center bg-[#F5F7FA] dark:bg-[#0f172a]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-6">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#2563EB] shadow-lg shadow-blue-500/25"
          aria-hidden
        >
          <span className="text-4xl font-semibold tracking-tight text-white">E</span>
        </div>
        <div className="text-center">
          <p className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Ezzy ERP
          </p>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">Smart Inventory &amp; Billing</p>
        </div>
        <div className="mt-4 flex items-center gap-2" aria-hidden>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2563EB] [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2563EB] [animation-delay:200ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2563EB] [animation-delay:400ms]" />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">{message}</p>
      </div>
      <p className="absolute bottom-8 text-[11px] text-slate-400 dark:text-slate-500">
        © Adtech ERP Solutions
      </p>
    </div>
  );
}
