import { isPublicStorefrontPath } from "@/lib/storefrontPath";
import "./index.css";

/**
 * Public storefront is a separate chunk so visitors to /:orgSlug/store
 * do not download the ERP shell (auth, sidebar, POS, accounts).
 */
if (isPublicStorefrontPath(window.location.pathname)) {
  void import("./storefront/bootstrap");
} else {
  void import("./erpBootstrap");
}
