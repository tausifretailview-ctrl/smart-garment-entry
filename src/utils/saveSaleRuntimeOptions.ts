/** Options for POS save+print: defer heavy dashboard refetch until after print. */
export type SaveSaleRuntimeOptions = {
  /** Queue dashboard invalidation (flush after print or fallback timeout). */
  deferDashboardInvalidation?: boolean;
  /** Do not block save completion on sale_return FIFO consume (POS only). */
  nonBlockingSaleReturnConsume?: boolean;
};

export const POS_DEFERRED_INVALIDATION_OPTS: SaveSaleRuntimeOptions = {
  deferDashboardInvalidation: true,
  nonBlockingSaleReturnConsume: true,
};
