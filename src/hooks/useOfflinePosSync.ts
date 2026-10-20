import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isNetworkFailure, isSameSyncedBill } from "@/lib/offlinePos/offlinePosCore";
import {
  OFFLINE_POS_SYNC_NOW_EVENT,
  allocateOfflineSaleNumber,
  getOfflinePosSnapshot,
  initOfflinePos,
  isNetworkDown,
  noteNetworkFailure,
  noteNetworkOk,
  readOfflineBills,
  refreshOfflineCatalog,
  removeOfflineBill,
  setOfflineSyncing,
  updateOfflineBill,
  type OfflinePosBill,
} from "@/lib/offlinePos/offlinePosStore";
import { POS_DEFERRED_INVALIDATION_OPTS, type SaveSaleRuntimeOptions } from "@/utils/saveSaleRuntimeOptions";

type SentSale = { id: string; sale_number: string; sale_date?: string | null; net_amount?: number | null };

type SaveSaleFn = (
  saleData: any,
  paymentMethod: "cash" | "card" | "upi" | "multiple" | "pay_later",
  paymentBreakdown: any,
  saleType: "pos",
  runtimeOptions?: SaveSaleRuntimeOptions,
) => Promise<SentSale | null>;

const CHECK_EVERY_MS = 60_000;

/**
 * Offline billing on the POS page: keeps this counter's saved item list fresh and
 * sends bills that were saved without internet, one by one, through the normal
 * POS save (same stock, ledger and points steps), keeping their OFL numbers.
 */
export function useOfflinePosSync(opts: {
  organizationId?: string | null;
  saveSale: SaveSaleFn;
  isSaving: boolean;
  /** After a bill reached the server (salesman commission etc.). */
  onBillSent?: (sale: SentSale, bill: OfflinePosBill) => void;
  /** After a sync round that sent at least one bill. */
  onRoundDone?: () => void;
}) {
  const { organizationId } = opts;
  const latest = useRef(opts);
  latest.current = opts;
  const running = useRef(false);

  const syncNow = useCallback(async () => {
    const orgId = latest.current.organizationId;
    if (!orgId || running.current || isNetworkDown()) return;
    if (readOfflineBills(orgId).length === 0) return;

    const run = async () => {
      running.current = true;
      setOfflineSyncing(true);
      let sent = 0;
      try {
        for (const queued of readOfflineBills(orgId)) {
          if (isNetworkDown()) break;
          // Another tab may have sent it meanwhile.
          let bill = readOfflineBills(orgId).find((b) => b.localId === queued.localId);
          if (!bill) continue;
          // Don't fight the cashier's own save.
          if (latest.current.isSaving) break;

          const { data: existing, error: lookupError } = await supabase
            .from("sales")
            .select("id, sale_number, net_amount, sale_date, deleted_at, is_cancelled")
            .eq("organization_id", orgId)
            .eq("sale_number", bill.saleNumber)
            .maybeSingle();
          if (lookupError) {
            if (isNetworkFailure(lookupError)) noteNetworkFailure();
            break;
          }
          if (existing) {
            // A cancelled half-save (rolled back) still holds the number.
            const live = !existing.deleted_at && !existing.is_cancelled;
            if (live && isSameSyncedBill(existing, bill)) {
              removeOfflineBill(orgId, bill.localId);
              continue;
            }
            // Number already used by a different bill (browser data was cleared):
            // send under the next free number and say which number was printed.
            const printed = bill.saleNumber;
            const saleNumber = allocateOfflineSaleNumber(orgId);
            const note = `Offline bill printed as ${printed}`;
            const notes = [bill.saleData.notes, note].filter(Boolean).join(" · ");
            updateOfflineBill(orgId, bill.localId, {
              saleNumber,
              saleData: { ...bill.saleData, notes },
            });
            bill = { ...bill, saleNumber, saleData: { ...bill.saleData, notes } };
          }

          const result = await latest.current.saveSale(
            bill.saleData,
            bill.paymentMethod,
            bill.paymentBreakdown,
            "pos",
            {
              ...POS_DEFERRED_INVALIDATION_OPTS,
              presetSaleNumber: bill.saleNumber,
              // The customer left long ago; no late WhatsApp bill.
              skipWhatsAppAutoSend: true,
            },
          );
          if (result) {
            removeOfflineBill(orgId, bill.localId);
            noteNetworkOk();
            sent++;
            latest.current.onBillSent?.(result, bill);
          } else {
            updateOfflineBill(orgId, bill.localId, {
              attempts: (bill.attempts || 0) + 1,
              lastError: "Could not send yet. It will be tried again.",
            });
            if (isNetworkDown()) break;
          }
        }
      } finally {
        running.current = false;
        setOfflineSyncing(false);
        if (sent > 0) {
          latest.current.onRoundDone?.();
          // Stock on the saved list now includes these bills.
          void refreshOfflineCatalog(orgId, { force: true });
        }
      }
    };

    // One POS tab per computer sends at a time.
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks?.request) {
      await locks.request("ezzy-offline-pos-sync", { ifAvailable: true }, async (lock) => {
        if (lock) await run();
      });
    } else {
      await run();
    }
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    initOfflinePos(organizationId);
    void refreshOfflineCatalog(organizationId).then(() => syncNow());

    const onOnline = () => {
      window.setTimeout(() => {
        void refreshOfflineCatalog(organizationId);
        void syncNow();
      }, 2000);
    };
    const onSyncNow = () => {
      noteNetworkOk();
      void syncNow();
    };
    const timer = window.setInterval(() => {
      if (!getOfflinePosSnapshot().enabled && readOfflineBills(organizationId).length === 0) return;
      void refreshOfflineCatalog(organizationId);
      void syncNow();
    }, CHECK_EVERY_MS);

    window.addEventListener("online", onOnline);
    window.addEventListener(OFFLINE_POS_SYNC_NOW_EVENT, onSyncNow);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(OFFLINE_POS_SYNC_NOW_EVENT, onSyncNow);
    };
  }, [organizationId, syncNow]);
}
