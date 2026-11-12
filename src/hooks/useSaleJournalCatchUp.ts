import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { runPurchaseJournalCatchUp, runSaleJournalCatchUp } from "@/lib/saleJournalCatchUp";

const FIRST_RUN_MS = 90 * 1000;
const EVERY_MS = 10 * 60 * 1000;

/**
 * Plan Phase 2 step 5: while a shop screen is open, post the sale and purchase journals its
 * recent bills are still waiting for (see src/lib/saleJournalCatchUp.ts). First run 90 s after opening,
 * then every 10 minutes, only while the tab is visible, one tab per shop at a time.
 */
export function useSaleJournalCatchUp(
  organizationId: string | undefined,
  settings: { accounting_engine_enabled?: boolean | null } | null | undefined,
): void {
  const engineOn = !!settings && isAccountingEngineEnabled(settings);

  useEffect(() => {
    if (!organizationId || !engineOn) return;
    let stopped = false;
    let running = false;

    const runOnce = async () => {
      if (stopped || running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const work = async () => {
          const { recordPurchaseJournalEntry, recordSaleJournalEntry } = await import(
            "@/utils/accounting/journalService"
          );
          await runSaleJournalCatchUp(supabase, organizationId, (saleId, orgId, saleDate) =>
            recordSaleJournalEntry(saleId, orgId, supabase, saleDate),
          );
          await runPurchaseJournalCatchUp(supabase, organizationId, (billId, orgId, net, paid, billDate) =>
            recordPurchaseJournalEntry(billId, orgId, net, paid, "pay_later", supabase, billDate),
          );
        };
        const locks = (navigator as Navigator & { locks?: LockManager }).locks;
        if (locks?.request) {
          // Another tab of this shop is already catching up: skip this run.
          await locks.request(`ezzy-sale-journal-catch-up:${organizationId}`, { ifAvailable: true }, async (lock) => {
            if (lock) await work();
          });
        } else {
          await work();
        }
      } catch (err) {
        console.warn("[saleJournalCatchUp] run failed; next run tries again", err);
      } finally {
        running = false;
      }
    };

    const first = window.setTimeout(() => void runOnce(), FIRST_RUN_MS);
    const every = window.setInterval(() => void runOnce(), EVERY_MS);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [organizationId, engineOn]);
}
