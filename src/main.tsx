import { isPublicStorefrontPath, setStorefrontCustomDomainSlug } from "@/lib/storefrontPath";
import { isPossibleStoreHost, resolveStoreSlugForHost } from "@/lib/storefrontDomain";
import "./index.css";

/**
 * Public storefront is a separate chunk so visitors to /:orgSlug/store
 * do not download the ERP shell (auth, sidebar, POS, accounts).
 * A shop's own custom domain (not an app host) also boots the storefront;
 * if the host is not a published store's domain, the ERP loads as before.
 */
if (isPublicStorefrontPath(window.location.pathname)) {
  void import("./storefront/bootstrap");
} else if (isPossibleStoreHost(window.location)) {
  void resolveStoreSlugForHost(window.location.hostname).then((slug) => {
    if (slug) {
      setStorefrontCustomDomainSlug(slug);
      void import("./storefront/bootstrap");
    } else {
      void import("./erpBootstrap");
    }
  });
} else {
  void import("./erpBootstrap");
}
