import { BackToDashboard } from "@/components/BackToDashboard";
import { DuplicatePurchaseBillsReconciler } from "@/components/DuplicatePurchaseBillsReconciler";

/** Inventory > Duplicate Purchase Bills (moved out of Settings > Purchase). */
export default function DuplicatePurchaseBills() {
  return (
    <div className="p-4 md:p-6 space-y-4 w-full">
      <div className="flex items-center gap-2">
        <BackToDashboard />
        <h1 className="text-xl font-bold">Duplicate Purchase Bills</h1>
      </div>
      <DuplicatePurchaseBillsReconciler />
    </div>
  );
}
