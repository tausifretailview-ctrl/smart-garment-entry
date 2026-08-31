import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { GstTaxType } from "@/utils/gstRegisterUtils";
import { normalizeGstTaxType } from "@/utils/gstRegisterUtils";
import type { GarmentGstRuleSettings } from "@/utils/gstRules";
import { maxSaleReturnAdjustForPayable } from "@/utils/saleSettlement";
import {
  addLine as addLinePure,
  type AddLineProduct,
  type AddLineVariant,
  buildPosSalePersistPayload,
  type CartMutatorResult,
  clearCart as clearCartPure,
  computePosBillTotals,
  mapSaleItemsToPosCart,
  normalizeFlatDiscountInput,
  type PosBillingError,
  type PosCartItem,
  type PosFlatDiscountMode,
  type PosGrossBasis,
  type PosSalePersistPayload,
  removeLine as removeLinePure,
  resolveBillFlatForPosEdit,
  type SaleItemRowForFlatResolve,
  type SaleRowForFlatResolve,
  updateDiscountAmount as updateDiscountAmountPure,
  updateDiscountPercent as updateDiscountPercentPure,
  updateGstPer as updateGstPerPure,
  updateMrp as updateMrpPure,
  updatePrice as updatePricePure,
  updateQty as updateQtyPure,
  applyCategoryTierPricingToCart,
  type CategoryTierRule,
} from "@/lib/posBilling";

export type UsePosBillingParams = {
  /**
   * Explicit gross / add-price basis. Call site must pass today's equivalent of
   * `(enable_mrp && pos_barcode_price_mode === 'mrp') ? 'mrp' : 'sale_price'`.
   * The hook never reads settings context.
   */
  grossBasis: PosGrossBasis;
  garmentGstSettings: GarmentGstRuleSettings | null | undefined;
  /** Injected — typically useCustomerPoints().calculateRedemptionValue */
  calculateRedemptionValue: (points: number) => number;
  /** Initial tax type (local bill state; not an org settings lookup inside the hook). */
  initialTaxType?: GstTaxType | string;
  /** Optional cart hydrate (e.g. session snapshot). Read once on mount. */
  initialItems?: PosCartItem[];
  /** Category quantity-tier bundle pricing — org opt-in from Settings → POS. */
  categoryTierPricing?: {
    enabled: boolean;
    rules: CategoryTierRule[];
    /** Festival leftover pricing (Settings → POS Auto Calculate Discount). Default off. */
    autoCalculateDiscount?: boolean;
  };
};

export type UsePosBillingResult = {
  items: PosCartItem[];
  itemsRef: MutableRefObject<PosCartItem[]>;
  setItems: Dispatch<SetStateAction<PosCartItem[]>>;

  flatDiscountValue: number;
  flatDiscountMode: PosFlatDiscountMode;
  setFlatDiscountMode: Dispatch<SetStateAction<PosFlatDiscountMode>>;
  setFlatDiscountValue: (value: number) => void;
  handleFlatDiscountValueChange: (value: number) => void;

  taxType: GstTaxType;
  setTaxType: (value: GstTaxType | string) => void;

  saleReturnAdjust: number;
  setSaleReturnAdjust: Dispatch<SetStateAction<number>>;
  creditApplied: number;
  setCreditApplied: Dispatch<SetStateAction<number>>;

  roundOff: number;
  setRoundOff: Dispatch<SetStateAction<number>>;
  isManualRoundOff: boolean;
  setIsManualRoundOff: Dispatch<SetStateAction<boolean>>;
  handleRoundOffChange: (value: number) => void;
  handleFinalAmountChange: (enteredAmount: number) => void;
  handleResetRoundOff: () => void;

  pointsToRedeem: number;
  setPointsToRedeem: Dispatch<SetStateAction<number>>;

  totals: ReturnType<typeof computePosBillTotals>;
  lastError: PosBillingError | null;
  clearLastError: () => void;

  addLine: (input: {
    product: AddLineProduct;
    variant: AddLineVariant;
    overridePrice?: { sale_price: number; mrp: number };
    brandDiscountPercent?: number;
    customerHasMasterDiscount?: boolean;
    makeLineId?: () => string;
  }) => CartMutatorResult;
  updateQty: (index: number, newQty: number) => CartMutatorResult;
  updatePrice: (index: number, rawValue: number) => CartMutatorResult;
  updateDiscountPercent: (index: number, discountPercent: number) => CartMutatorResult;
  updateDiscountAmount: (index: number, discountAmount: number) => CartMutatorResult;
  updateMrp: (index: number, newMrp: number) => CartMutatorResult;
  updateGstPer: (index: number, newGstPer: number) => CartMutatorResult;
  removeLine: (index: number) => void;
  clearCart: () => void;

  /** Edit-existing-bill: restore flat + map sale_items → cart. */
  loadFromSaleEdit: (
    sale: SaleRowForFlatResolve & { tax_type?: string | null; sale_return_adjust?: number | null },
    saleItems: Array<
      SaleItemRowForFlatResolve & {
        id: string;
        barcode?: string | null;
        product_name: string;
        size?: string | null;
        color?: string | null;
        quantity: number;
        mrp: number;
        unit_price: number;
        gst_percent?: number | null;
        discount_percent?: number | null;
        line_total: number;
        product_id: string;
        variant_id: string;
        hsn_code?: string | null;
        item_notes?: string | null;
      }
    >,
  ) => { flat: ReturnType<typeof resolveBillFlatForPosEdit>; items: PosCartItem[] };

  /** Resume held bill cart blob into engine state. */
  loadHeldCart: (holdData: {
    items?: PosCartItem[];
    flatDiscountPercent?: number;
    saleReturnAdjust?: number;
    roundOff?: number;
    taxType?: string;
  }) => void;

  buildSaleData: (meta: {
    customerId?: string | null;
    customerName: string;
    customerPhone?: string | null;
    salesman?: string | null;
    notes?: string | null;
    saleDate?: string;
  }) => PosSalePersistPayload;

  maxSrFromBill: number;
};

/**
 * Headless POS billing engine — cart, discounts, totals, edit/hold restore, sale payload.
 * No toast / DOM / navigation / settings context. Side effects stay in the caller.
 */
export function usePosBilling(params: UsePosBillingParams): UsePosBillingResult {
  const { grossBasis, garmentGstSettings, calculateRedemptionValue, categoryTierPricing } = params;

  const tierFinalize = useCallback(
    (raw: PosCartItem[]) => {
      if (!categoryTierPricing?.enabled || !categoryTierPricing.rules?.length) return raw;
      return applyCategoryTierPricingToCart(raw, categoryTierPricing.rules, garmentGstSettings, {
        remainderPricing: categoryTierPricing.autoCalculateDiscount ? "scheme_rate" : "leftover_single",
      });
    },
    [categoryTierPricing?.enabled, categoryTierPricing?.rules, categoryTierPricing?.autoCalculateDiscount, garmentGstSettings],
  );

  const [items, setItemsState] = useState<PosCartItem[]>(() => {
    const initial = Array.isArray(params.initialItems) ? params.initialItems : [];
    return tierFinalize(initial);
  });
  const itemsRef = useRef<PosCartItem[]>(items);
  itemsRef.current = items;

  /** Keep itemsRef in sync inside the updater (same tick as setState) — matches prior POSSales. */
  const setItems = useCallback(
    (updater: SetStateAction<PosCartItem[]>) => {
      setItemsState((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: PosCartItem[]) => PosCartItem[])(prev)
            : updater;
        const finalized = tierFinalize(next);
        itemsRef.current = finalized;
        return finalized;
      });
    },
    [tierFinalize],
  );

  useEffect(() => {
    setItemsState((prev) => {
      const finalized = tierFinalize(prev);
      itemsRef.current = finalized;
      return finalized;
    });
  }, [tierFinalize]);

  const [flatDiscountValue, setFlatDiscountValueRaw] = useState(0);
  const [flatDiscountMode, setFlatDiscountMode] = useState<PosFlatDiscountMode>("percent");
  const [taxType, setTaxTypeState] = useState<GstTaxType>(() =>
    normalizeGstTaxType(params.initialTaxType),
  );
  const [saleReturnAdjust, setSaleReturnAdjust] = useState(0);
  const [creditApplied, setCreditApplied] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [isManualRoundOff, setIsManualRoundOff] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [lastError, setLastError] = useState<PosBillingError | null>(null);

  const setFlatDiscountValue = useCallback((value: number) => {
    setFlatDiscountValueRaw(normalizeFlatDiscountInput(value));
  }, []);

  const handleFlatDiscountValueChange = setFlatDiscountValue;

  const setTaxType = useCallback((value: GstTaxType | string) => {
    setTaxTypeState(normalizeGstTaxType(value));
  }, []);

  const totals = useMemo(
    () =>
      computePosBillTotals({
        items,
        taxType,
        flatDiscountValue,
        flatDiscountMode,
        saleReturnAdjust,
        creditApplied,
        roundOff,
        pointsToRedeem,
        calculateRedemptionValue,
      }),
    [
      items,
      taxType,
      flatDiscountValue,
      flatDiscountMode,
      saleReturnAdjust,
      creditApplied,
      roundOff,
      pointsToRedeem,
      calculateRedemptionValue,
    ],
  );

  // Auto-update roundOff when calculation changes (only if not manual) — same as POSSales.
  useEffect(() => {
    if (!isManualRoundOff) {
      if (items.length > 0) {
        const newRoundOff = parseFloat(totals.calculatedRoundOff.toFixed(2));
        if (Math.abs(newRoundOff - roundOff) > 0.001) {
          setRoundOff(newRoundOff);
        }
      } else if (roundOff !== 0) {
        setRoundOff(0);
      }
    }
  }, [totals.amountBeforeRoundOff, totals.calculatedRoundOff, items.length, isManualRoundOff, roundOff]);

  const handleRoundOffChange = useCallback((value: number) => {
    setRoundOff(parseFloat(value.toFixed(2)));
    setIsManualRoundOff(true);
  }, []);

  const handleFinalAmountChange = useCallback(
    (enteredAmount: number) => {
      const newRoundOff = enteredAmount - totals.amountBeforeRoundOff;
      setRoundOff(parseFloat(newRoundOff.toFixed(2)));
      setIsManualRoundOff(true);
    },
    [totals.amountBeforeRoundOff],
  );

  const handleResetRoundOff = useCallback(() => {
    setIsManualRoundOff(false);
    setRoundOff(parseFloat(totals.calculatedRoundOff.toFixed(2)));
  }, [totals.calculatedRoundOff]);

  const applyMutator = useCallback(
    (result: CartMutatorResult) => {
      const finalized = tierFinalize(result.items);
      itemsRef.current = finalized;
      setItemsState(finalized);
      if (result.error) setLastError(result.error);
      else setLastError(null);
      return { ...result, items: finalized };
    },
    [tierFinalize],
  );

  const addLine = useCallback(
    (input: {
      product: AddLineProduct;
      variant: AddLineVariant;
      overridePrice?: { sale_price: number; mrp: number };
      brandDiscountPercent?: number;
      customerHasMasterDiscount?: boolean;
      makeLineId?: () => string;
    }) =>
      applyMutator(
        addLinePure({
          items: itemsRef.current,
          product: input.product,
          variant: input.variant,
          grossBasis,
          garmentGstSettings,
          overridePrice: input.overridePrice,
          brandDiscountPercent: input.brandDiscountPercent,
          customerHasMasterDiscount: input.customerHasMasterDiscount,
          makeLineId: input.makeLineId,
        }),
      ),
    [applyMutator, garmentGstSettings, grossBasis],
  );

  const updateQty = useCallback(
    (index: number, newQty: number) => applyMutator(updateQtyPure(itemsRef.current, index, newQty)),
    [applyMutator],
  );

  const updatePrice = useCallback(
    (index: number, rawValue: number) =>
      applyMutator(
        updatePricePure(
          itemsRef.current,
          index,
          rawValue,
          totals.flatDiscountAmount,
          garmentGstSettings,
        ),
      ),
    [applyMutator, garmentGstSettings, totals.flatDiscountAmount],
  );

  const updateDiscountPercent = useCallback(
    (index: number, discountPercent: number) =>
      applyMutator(
        updateDiscountPercentPure(
          itemsRef.current,
          index,
          discountPercent,
          totals.flatDiscountAmount,
          garmentGstSettings,
        ),
      ),
    [applyMutator, garmentGstSettings, totals.flatDiscountAmount],
  );

  const updateDiscountAmount = useCallback(
    (index: number, discountAmount: number) =>
      applyMutator(
        updateDiscountAmountPure(
          itemsRef.current,
          index,
          discountAmount,
          totals.flatDiscountAmount,
          garmentGstSettings,
        ),
      ),
    [applyMutator, garmentGstSettings, totals.flatDiscountAmount],
  );

  const updateMrp = useCallback(
    (index: number, newMrp: number) =>
      applyMutator(
        updateMrpPure(
          itemsRef.current,
          index,
          newMrp,
          totals.flatDiscountAmount,
          garmentGstSettings,
        ),
      ),
    [applyMutator, garmentGstSettings, totals.flatDiscountAmount],
  );

  const updateGstPer = useCallback(
    (index: number, newGstPer: number) =>
      applyMutator(updateGstPerPure(itemsRef.current, index, newGstPer)),
    [applyMutator],
  );

  const removeLine = useCallback(
    (index: number) => {
      applyMutator(removeLinePure(itemsRef.current, index));
    },
    [applyMutator],
  );

  const clearCart = useCallback(() => {
    applyMutator(clearCartPure());
    setFlatDiscountValueRaw(0);
    setFlatDiscountMode("percent");
    setSaleReturnAdjust(0);
    setCreditApplied(0);
    setRoundOff(0);
    setIsManualRoundOff(false);
    setPointsToRedeem(0);
  }, [applyMutator]);

  const loadFromSaleEdit: UsePosBillingResult["loadFromSaleEdit"] = useCallback(
    (sale, saleItems) => {
      const flat = resolveBillFlatForPosEdit(sale, saleItems);
      if (flat.percentLooksClean) {
        setFlatDiscountValue(flat.value);
        setFlatDiscountMode("percent");
      } else if (flat.value > 0.005) {
        setFlatDiscountValue(flat.value);
        setFlatDiscountMode(flat.mode);
      } else {
        setFlatDiscountValueRaw(0);
        setFlatDiscountMode("percent");
      }
      const cartItems = mapSaleItemsToPosCart(saleItems);
      setItems(cartItems);
      if (sale.tax_type != null && sale.tax_type !== "") {
        setTaxTypeState(normalizeGstTaxType(String(sale.tax_type)));
      }
      if (sale.sale_return_adjust != null) {
        setSaleReturnAdjust(Number(sale.sale_return_adjust) || 0);
      }
      return { flat, items: cartItems };
    },
    [setFlatDiscountValue],
  );

  const loadHeldCart: UsePosBillingResult["loadHeldCart"] = useCallback((holdData) => {
    if (holdData.items && Array.isArray(holdData.items)) {
      setItems(holdData.items);
    }
    if (holdData.flatDiscountPercent !== undefined) {
      setFlatDiscountValueRaw(normalizeFlatDiscountInput(holdData.flatDiscountPercent));
      setFlatDiscountMode("percent");
    }
    if (holdData.saleReturnAdjust !== undefined) {
      setSaleReturnAdjust(holdData.saleReturnAdjust);
    }
    if (holdData.roundOff !== undefined) {
      setRoundOff(holdData.roundOff);
    }
    if (holdData.taxType != null && holdData.taxType !== "") {
      setTaxTypeState(normalizeGstTaxType(String(holdData.taxType)));
    }
  }, []);

  const buildSaleData: UsePosBillingResult["buildSaleData"] = useCallback(
    (meta) =>
      buildPosSalePersistPayload({
        customerId: meta.customerId,
        customerName: meta.customerName,
        customerPhone: meta.customerPhone,
        items,
        totals,
        saleReturnAdjust,
        roundOff,
        creditApplied,
        salesman: meta.salesman,
        notes: meta.notes,
        taxType,
        saleDate: meta.saleDate,
      }),
    [items, totals, saleReturnAdjust, roundOff, creditApplied, taxType],
  );

  const maxSrFromBill = maxSaleReturnAdjustForPayable(totals.finalAmount, saleReturnAdjust);

  return {
    items,
    itemsRef,
    setItems,
    flatDiscountValue,
    flatDiscountMode,
    setFlatDiscountMode,
    setFlatDiscountValue,
    handleFlatDiscountValueChange,
    taxType,
    setTaxType,
    saleReturnAdjust,
    setSaleReturnAdjust,
    creditApplied,
    setCreditApplied,
    roundOff,
    setRoundOff,
    isManualRoundOff,
    setIsManualRoundOff,
    handleRoundOffChange,
    handleFinalAmountChange,
    handleResetRoundOff,
    pointsToRedeem,
    setPointsToRedeem,
    totals,
    lastError,
    clearLastError: () => setLastError(null),
    addLine,
    updateQty,
    updatePrice,
    updateDiscountPercent,
    updateDiscountAmount,
    updateMrp,
    updateGstPer,
    removeLine,
    clearCart,
    loadFromSaleEdit,
    loadHeldCart,
    buildSaleData,
    maxSrFromBill,
  };
}
