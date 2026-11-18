import { createContext } from "react";
import { EMPTY_STOREFRONT_SIGNALS, indexStorefrontSignals, type StorefrontSignalIndex } from "@/lib/storefrontSignals";

/** Best-seller ranks, selling-fast and just-arrived lookups for the product cards (empty = none). */
export const StreetSignalsContext = createContext<StorefrontSignalIndex>(indexStorefrontSignals(EMPTY_STOREFRONT_SIGNALS));
