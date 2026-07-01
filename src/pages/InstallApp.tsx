import { useEffect, useLayoutEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Share, Plus, Smartphone, CheckCircle2, Copy, MessageCircle, Monitor, RefreshCw, Info } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { toast } from "sonner";
import { isValidOrgSlug, storeOrgSlug } from "@/lib/orgSlug";
import {
  APP_VERSION,
  ANDROID_APK_DOWNLOAD_NAME,
  WINDOWS_PORTABLE_FILE,
  WINDOWS_PORTABLE_URL,
  WINDOWS_SETUP_FILE,
  WINDOWS_SETUP_URL,
  buildAndroidApkDownloadUrl,
  isAndroidApkConfigured,
  isAndroidApkStorageUrl,
  isWindowsInstallerConfigured,
  isWindowsPortableConfigured,
} from "@/config/downloads";

type InstallerProbeStatus = "idle" | "checking" | "available" | "unavailable";

declare global {
  interface Window {
    __pwaInstallPrompt?: Event;
  }
}

/** HEAD first; fall back to a tiny ranged GET when HEAD is blocked. */
async function probeInstallerDownload(url: string): Promise<boolean> {
  try {
    const head = await fetch(url, { method: "HEAD", cache: "no-store", redirect: "manual" });
    if (head.ok || head.status === 405 || head.status === 302) return true;
    if (head.status === 404) return false;
    const ranged = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
    });
    if (ranged.ok || ranged.status === 206) return true;
    return ranged.status !== 404;
  } catch {
    // Offline / CORS — allow click; server may still serve GET.
    return true;
  }
}

type Platform = "android" | "ios" | "desktop" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  if (/iPhone|iPod/.test(ua) || isIPad) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Mobi/.test(ua)) return "other";
  return "desktop";
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Install page is APK-only — do not register as an installable PWA. */
function useDisablePwaOnInstallPage(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousManifestHref = manifestLink?.getAttribute("href") ?? null;
    manifestLink?.remove();
    window.__pwaInstallPrompt = undefined;

    const blockInstallPrompt = (e: Event) => {
      e.preventDefault();
      window.__pwaInstallPrompt = undefined;
    };
    window.addEventListener("beforeinstallprompt", blockInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", blockInstallPrompt);
      if (manifestLink && previousManifestHref && !document.querySelector('link[rel="manifest"]')) {
        manifestLink.href = previousManifestHref;
        document.head.appendChild(manifestLink);
      }
    };
  }, [active]);
}

export default function InstallApp() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { isInstalled } = useInstallPrompt();
  const [orgName, setOrgName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [windowsSetupStatus, setWindowsSetupStatus] = useState<InstallerProbeStatus>("idle");
  const [windowsPortableStatus, setWindowsPortableStatus] = useState<InstallerProbeStatus>("idle");
  const [windowsDownloadBusy, setWindowsDownloadBusy] = useState(false);
  const androidApkConfigured = isAndroidApkConfigured();
  const androidApkUsesStorageUrl = isAndroidApkStorageUrl();
  const platform = detectPlatform();
  const isStandalone = isStandaloneDisplay();
  const isNativeShell = Capacitor.isNativePlatform();

  useDisablePwaOnInstallPage(!!orgSlug && isValidOrgSlug(orgSlug));

  // PWA / native shell: install page is only for downloading; open the org app once installed.
  useLayoutEffect(() => {
    if (!orgSlug || !isValidOrgSlug(orgSlug)) return;
    const p = window.location.pathname.replace(/\/$/, "");
    if (p !== `/${orgSlug}/install`) return;
    if (isStandaloneDisplay() || Capacitor.isNativePlatform()) {
      window.location.replace(`/${orgSlug}`);
    }
  }, [orgSlug]);

  useLayoutEffect(() => {
    if (!orgSlug || !isValidOrgSlug(orgSlug)) return;
    storeOrgSlug(orgSlug);
  }, [orgSlug]);

  const linkOrigin =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? window.location.origin
      : `https://${window.location.host}`;

  useEffect(() => {
    if (!orgSlug) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("organizations")
        .select("name")
        .eq("slug", orgSlug)
        .maybeSingle();
      if (data) setOrgName((data as { name?: string }).name || "");
      setLoading(false);
    })();
  }, [orgSlug]);

  const installUrl = `${linkOrigin}/${orgSlug}/install`;
  const androidApkUrl = buildAndroidApkDownloadUrl();
  const windowsSetupUrl = WINDOWS_SETUP_URL;
  const windowsPortableUrl = WINDOWS_PORTABLE_URL;
  const windowsInstallerConfigured = isWindowsInstallerConfigured();
  const windowsPortableConfigured = isWindowsPortableConfigured();
  const appStartUrl = `${window.location.origin}/${orgSlug}`;

  const probeWindowsInstallers = async () => {
    if (!windowsInstallerConfigured) return;
    setWindowsSetupStatus("checking");
    if (windowsPortableConfigured) setWindowsPortableStatus("checking");

    const [setupOk, portableOk] = await Promise.all([
      probeInstallerDownload(windowsSetupUrl),
      windowsPortableConfigured
        ? probeInstallerDownload(windowsPortableUrl)
        : Promise.resolve(true),
    ]);

    setWindowsSetupStatus(setupOk ? "available" : "unavailable");
    if (windowsPortableConfigured) {
      setWindowsPortableStatus(portableOk ? "available" : "unavailable");
    }
  };

  useEffect(() => {
    if (!windowsInstallerConfigured || platform !== "desktop") return;
    void probeWindowsInstallers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- probe when install URLs are known
  }, [windowsInstallerConfigured, windowsPortableConfigured, platform]);

  const copyApkLink = () => {
    navigator.clipboard.writeText(androidApkUrl);
    toast.success("Android APK link copied");
  };

  const handleAndroidDownload = async () => {
    if (!androidApkConfigured) return;

    const downloadUrl = `${androidApkUrl}&t=${Date.now()}`;
    try {
      const probe = await fetch(downloadUrl, { method: "HEAD", cache: "no-store", redirect: "manual" });
      if (!probe.ok && probe.status !== 405 && probe.status !== 302) {
        toast.error("Download unavailable right now. Refresh this page and try again.");
        return;
      }
    } catch {
      // Offline or CORS on HEAD — still try download (GET works on edge function).
    }

    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = ANDROID_APK_DOWNLOAD_NAME;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // Fallback when cross-origin download attribute is ignored (common on Android Chrome).
    window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        window.location.assign(downloadUrl);
      }
    }, 400);
  };

  const copyWindowsSetupLink = () => {
    navigator.clipboard.writeText(windowsSetupUrl);
    toast.success("Windows installer link copied");
  };

  const handleWindowsDownload = async (
    url: string,
    fileLabel: string,
    setStatus: (status: InstallerProbeStatus) => void,
  ) => {
    setWindowsDownloadBusy(true);
    setStatus("checking");
    try {
      const ok = await probeInstallerDownload(url);
      if (!ok) {
        setStatus("unavailable");
        toast.error(
          `Windows installer (${fileLabel}) is not on the server yet. Ask your admin to upload it, or use the web app.`,
        );
        return;
      }
      setStatus("available");
      window.location.assign(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`);
    } finally {
      setWindowsDownloadBusy(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(installUrl);
    toast.success("Install link copied");
  };

  const shareWhatsApp = () => {
    const apkLine = androidApkConfigured ? `\nAndroid APK: ${androidApkUrl}` : "";
    const winLine = windowsInstallerConfigured ? `\nWindows PC: ${windowsSetupUrl}` : "";
    const text = `Install ${orgName || "our"} EzzyERP app:\n${installUrl}${apkLine}${winLine}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!orgSlug || !isValidOrgSlug(orgSlug)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground text-center">
          Invalid install link. Use <span className="font-mono text-foreground">/your-shop-slug/install</span> (example:{" "}
          <a className="text-primary underline" href="https://app.inventoryshop.in/ella-noor/install">
            ella-noor/install
          </a>
          ).
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background px-4 py-8">
      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <Smartphone className="h-10 w-10 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{orgName || "Ezzy ERP"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {platform === "desktop" ? "Download for phone or computer" : "Install the app on your phone"}
            </p>
          </div>
        </div>

        {isNativeShell ? (
          <Card className="p-6 text-center space-y-3 border-green-500/30 bg-green-500/5">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <h2 className="font-semibold text-lg">Native app installed</h2>
            <Button asChild className="w-full" size="lg">
              <a href={appStartUrl}>Open App</a>
            </Button>
          </Card>
        ) : isStandalone || isInstalled ? (
          <Card className="p-6 text-center space-y-3 border-amber-500/30 bg-amber-500/5">
            <CheckCircle2 className="h-12 w-12 text-amber-600 mx-auto" />
            <h2 className="font-semibold text-lg">Browser shortcut installed</h2>
            <p className="text-sm text-muted-foreground">
              This is a web shortcut, not the native APK. For USB printing and full Android features, tap{" "}
              <strong>Download EzzyERP for Android</strong> below.
            </p>
            <Button asChild variant="outline" className="w-full" size="lg">
              <a href={appStartUrl}>Open Web Shortcut</a>
            </Button>
          </Card>
        ) : platform === "ios" ? (
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center text-sm">1</span>
              Open in Safari
            </h2>
            <p className="text-sm text-muted-foreground -mt-2 ml-9">
              This page must be opened in <strong>Safari</strong> (not Chrome) for install to work on iPhone/iPad.
            </p>

            <h2 className="font-semibold text-lg flex items-center gap-2 pt-2">
              <span className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center text-sm">2</span>
              Tap the Share button
            </h2>
            <div className="ml-9 flex items-center gap-2 text-sm text-muted-foreground">
              Tap <Share className="h-5 w-5 text-primary" /> at the bottom of Safari
            </div>

            <h2 className="font-semibold text-lg flex items-center gap-2 pt-2">
              <span className="bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center text-sm">3</span>
              Add to Home Screen
            </h2>
            <div className="ml-9 flex items-center gap-2 text-sm text-muted-foreground">
              Scroll and tap <Plus className="h-4 w-4 text-primary" /> <strong>&quot;Add to Home Screen&quot;</strong>
            </div>
            <p className="text-xs text-muted-foreground ml-9 pt-1">
              Tip: After it appears on your home screen, open the app from that icon — it will open your shop directly.
            </p>

            <div className="pt-2 border-t">
              <Button asChild variant="outline" className="w-full" size="lg">
                <a href={appStartUrl}>Continue in Browser</a>
              </Button>
            </div>
          </Card>
        ) : null}

        {/* Android APK — shown on Android phones and on desktop (for sharing / sideload) */}
        {platform !== "ios" && (
          <Card className="p-6 space-y-4">
            <div className="text-center space-y-1">
              <h2 className="font-semibold text-lg">Download Android App</h2>
              <p className="text-sm text-muted-foreground">
                {platform === "desktop"
                  ? "Share this APK link with staff — open on an Android phone to install."
                  : "Native app — opens your shop, updates automatically from the cloud."}
              </p>
            </div>
            <Button
              className="w-full h-14 text-base"
              size="lg"
              disabled={!androidApkConfigured}
              onClick={handleAndroidDownload}
            >
              <Download className="mr-2 h-5 w-5" />
              Download EzzyERP for Android
            </Button>
            {!androidApkConfigured && (
              <p className="text-xs text-center text-destructive">
                Android installer not configured yet.
              </p>
            )}
            {androidApkConfigured && (
              <>
                {androidApkUsesStorageUrl && (
                  <p className="text-xs text-center text-amber-700 dark:text-amber-400">
                    Using secure download server (storage links cannot install as APK).
                  </p>
                )}
                <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                  <span className="text-xs flex-1 truncate font-mono">{androidApkUrl}</span>
                  <Button variant="ghost" size="sm" className="shrink-0 h-8 px-2" onClick={copyApkLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Card className="p-4 space-y-2 bg-muted/40 border-dashed">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="space-y-2 text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground">Already have the app?</p>
                      <p>
                        <strong>No reinstall</strong> for daily updates — the app loads the latest screens from the cloud
                        when you open it.
                      </p>
                      <p>
                        <strong>Reinstall APK</strong> only for a new native release (version {APP_VERSION}) — tap
                        Download above; Android updates over the old app if the signing key matches.
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4 space-y-2 bg-amber-500/5 border-amber-500/30">
                  <div className="flex items-start gap-2">
                    <RefreshCw className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground">Download error (InvalidJWT / link expired)?</p>
                      <p>
                        Tap <strong>Download EzzyERP for Android</strong> on this page — do not reuse an old APK link
                        from chat. Share the <strong>install page</strong> link ({installUrl}), not a storage file URL.
                      </p>
                      <p>
                        If Chrome offers <strong>Install app</strong>, dismiss it — that adds a web shortcut only. You
                        need the APK file from the blue Download button.
                      </p>
                    </div>
                  </div>
                </Card>
              </>
            )}
            <p className="text-xs text-center text-muted-foreground">
              {platform === "desktop" ? (
                <>Version {APP_VERSION} · Open the APK link on an Android phone, then tap <strong>Install</strong> (not Open in browser).</>
              ) : (
                <>
                  1. Tap Download above · 2. Open notification or Files app · 3. Tap the APK · 4. Choose{" "}
                  <strong>Install</strong> (do not open in Chrome). Allow <strong>Install unknown apps</strong> if asked.
                </>
              )}
            </p>
            {platform !== "desktop" && (
              <div className="pt-2 border-t">
                <Button asChild variant="ghost" className="w-full" size="lg">
                  <a href={appStartUrl}>Open in Browser (no install)</a>
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Windows — desktop browsers (and shareable from install page) */}
        {!(isStandalone || isInstalled) && platform === "desktop" && windowsInstallerConfigured && (
          <Card className="p-6 space-y-4">
            <div className="text-center space-y-1">
              <h2 className="font-semibold text-lg flex items-center justify-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                Download for Windows
              </h2>
              <p className="text-sm text-muted-foreground">
                Desktop app — opens like Tally/Vyapar, no browser needed.
              </p>
            </div>
            <Button
              className="w-full h-14 text-base"
              size="lg"
              disabled={windowsDownloadBusy || windowsSetupStatus === "checking"}
              onClick={() =>
                void handleWindowsDownload(
                  windowsSetupUrl,
                  WINDOWS_SETUP_FILE,
                  setWindowsSetupStatus,
                )
              }
            >
              <Download className="mr-2 h-5 w-5" />
              {windowsSetupStatus === "checking" ? "Checking installer…" : "Download EzzyERP for Windows"}
            </Button>
            {windowsSetupStatus === "unavailable" && (
              <Card className="p-4 space-y-2 bg-destructive/5 border-destructive/40">
                <p className="text-sm font-semibold text-destructive">Windows installer not available</p>
                <p className="text-xs text-muted-foreground">
                  The server could not find <span className="font-mono text-foreground">{WINDOWS_SETUP_FILE}</span> (version{" "}
                  {APP_VERSION}). Your admin must upload the installer to Supabase storage, then tap{" "}
                  <strong>Check again</strong> below.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={windowsDownloadBusy}
                  onClick={() => void probeWindowsInstallers()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Check again
                </Button>
              </Card>
            )}
            {windowsPortableConfigured && (
              <Button
                variant="outline"
                className="w-full"
                size="sm"
                disabled={
                  windowsDownloadBusy ||
                  windowsPortableStatus === "checking" ||
                  windowsPortableStatus === "unavailable"
                }
                onClick={() =>
                  void handleWindowsDownload(
                    windowsPortableUrl,
                    WINDOWS_PORTABLE_FILE,
                    setWindowsPortableStatus,
                  )
                }
              >
                {windowsPortableStatus === "checking"
                  ? "Checking portable…"
                  : "Portable version (no install needed)"}
              </Button>
            )}
            {windowsPortableStatus === "unavailable" && (
              <p className="text-xs text-center text-destructive">
                Portable file <span className="font-mono">{WINDOWS_PORTABLE_FILE}</span> is not on the server yet.
              </p>
            )}
            <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
              <span className="text-xs flex-1 truncate font-mono">{windowsSetupUrl}</span>
              <Button variant="ghost" size="sm" className="shrink-0 h-8 px-2" onClick={copyWindowsSetupLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Windows 10/11 (64-bit) · Version {APP_VERSION}. If Windows shows &quot;Unknown publisher&quot;, click{" "}
              <strong>More info → Run anyway</strong>.
            </p>
            <Card className="p-4 space-y-2 bg-amber-500/5 border-amber-500/30">
              <div className="flex items-start gap-2">
                <RefreshCw className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Download failed or blank page?</p>
                  <p>
                    Open this install page in Chrome and tap <strong>Download</strong> again — do not reuse an old link
                    from chat. Share the <strong>install page</strong> link ({installUrl}), not a one-time download URL.
                  </p>
                  <p>
                    Until the installer is uploaded, use <strong>Open Web App instead</strong> below — daily updates work
                    in the browser without reinstalling.
                  </p>
                </div>
              </div>
            </Card>
            <div className="pt-2 border-t">
              <Button asChild variant="ghost" className="w-full" size="lg">
                <a href={appStartUrl}>Open Web App instead</a>
              </Button>
            </div>
          </Card>
        )}

        {/* Share section */}
        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold text-foreground">Share install link with team</div>
          <p className="text-xs text-muted-foreground">
            Share the <strong>https</strong> link (recommended). Plain <strong>http</strong> links redirect to HTTPS automatically.
          </p>
          <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
            <span className="text-xs flex-1 truncate font-mono">{installUrl}</span>
          </div>
          {platform !== "ios" && androidApkConfigured && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Android APK direct link</div>
              <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                <span className="text-xs flex-1 truncate font-mono">{androidApkUrl}</span>
                <Button variant="ghost" size="sm" className="shrink-0 h-8 px-2" onClick={copyApkLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {windowsInstallerConfigured && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Windows installer direct link</div>
              <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                <span className="text-xs flex-1 truncate font-mono">{windowsSetupUrl}</span>
                <Button variant="ghost" size="sm" className="shrink-0 h-8 px-2" onClick={copyWindowsSetupLink}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Copy className="mr-2 h-4 w-4" /> Copy Link
            </Button>
            <Button variant="outline" size="sm" onClick={shareWhatsApp} className="text-green-700 border-green-300">
              <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
            </Button>
          </div>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Powered by Ezzy ERP
        </p>
      </div>
    </div>
  );
}
