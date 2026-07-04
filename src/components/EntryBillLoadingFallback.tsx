import { AppBootSplash } from "@/components/AppBootSplash";

/** Full-viewport placeholder while Sales/Purchase bill JS chunk loads (Windows WebView). */
export function EntryBillLoadingFallback() {
  return <AppBootSplash message="Loading bill screen…" />;
}
