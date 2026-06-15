import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Share, Plus, Smartphone, CheckCircle2, Copy, MessageCircle } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { toast } from "sonner";
import { isValidOrgSlug, storeOrgSlug } from "@/lib/orgSlug";

type Platform = "android" | "ios" | "desktop" | "other";

// Installers served from public/downloads/ (upload after each release build).
const ANDROID_APK_URL = "/downloads/EzzyERP-1.1.0.apk";
const WINDOWS_SETUP_URL = "/downloads/EzzyERP-Setup-1.0.0.exe";
const WINDOWS_PORTABLE_URL = "/downloads/EzzyERP-Portable-1.0.0.exe";

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

function buildOrgManifestJson(orgSlug: string, orgName: string): string {
  const origin = window.location.origin;
  const label = orgName || orgSlug;
  return JSON.stringify({
    name: `EzzyERP — ${label}`,
    short_name: label.length > 16 ? `${label.slice(0, 14)}…` : label,
    description: "EzzyERP - Easy Billing, Smart Business for garment & retail businesses",
    theme_color: "#1e40af",
    background_color: "#ffffff",
    display: "standalone",
    orientation: "portrait",
    scope: `${origin}/`,
    start_url: `${origin}/${orgSlug}`,
    id: `${origin}/${orgSlug}`,
    categories: ["business", "finance", "productivity"],
    icons: [
      {
        src: `${origin}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: `${origin}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  });
}

export default function InstallApp() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();
  const [orgName, setOrgName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [apkAvailable, setApkAvailable] = useState<boolean | null>(null);
  const platform = detectPlatform();
  const isStandalone = isStandaloneDisplay();
  const manifestRevokeRef = useRef<(() => void) | null>(null);

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

  useEffect(() => {
    if (!orgSlug || !isValidOrgSlug(orgSlug)) return;

    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;

    const apply = () => {
      manifestRevokeRef.current?.();
      manifestRevokeRef.current = null;
      const json = buildOrgManifestJson(orgSlug, orgName);
      const blob = new Blob([json], { type: "application/manifest+json" });
      const url = URL.createObjectURL(blob);
      link.href = url;
      manifestRevokeRef.current = () => URL.revokeObjectURL(url);
    };

    apply();
    return () => {
      manifestRevokeRef.current?.();
      manifestRevokeRef.current = null;
      link.removeAttribute("href");
      link.href = "/manifest.webmanifest";
    };
  }, [orgSlug, orgName]);

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

  useEffect(() => {
    const apkUrl = `${linkOrigin}${ANDROID_APK_URL}`;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apkUrl, { method: "HEAD" });
        if (!cancelled) setApkAvailable(res.ok);
      } catch {
        if (!cancelled) setApkAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [linkOrigin]);

  const installUrl = `${linkOrigin}/${orgSlug}/install`;
  const androidApkUrl = `${linkOrigin}${ANDROID_APK_URL}`;
  const appStartUrl = `${window.location.origin}/${orgSlug}`;

  const copyApkLink = () => {
    navigator.clipboard.writeText(androidApkUrl);
    toast.success("Android APK link copied");
  };

  const handleInstall = async () => {
    if (isInstallable) {
      const accepted = await promptInstall();
      if (accepted) toast.success("App installed!");
    } else if (platform === "android") {
      toast.info("Open Chrome menu (⋮) → 'Install app' or 'Add to Home screen'");
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(installUrl);
    toast.success("Install link copied");
  };

  const shareWhatsApp = () => {
    const text = `Install ${orgName || "our"} EzzyERP app:\n${installUrl}\nAndroid APK: ${androidApkUrl}`;
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

        {isStandalone || isInstalled ? (
          <Card className="p-6 text-center space-y-3 border-green-500/30 bg-green-500/5">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto" />
            <h2 className="font-semibold text-lg">App already installed</h2>
            <Button asChild className="w-full" size="lg">
              <a href={appStartUrl}>Open App</a>
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
        {!(isStandalone || isInstalled) && platform !== "ios" && (
          <Card className="p-6 space-y-4">
            <div className="text-center space-y-1">
              <h2 className="font-semibold text-lg">Download Android App</h2>
              <p className="text-sm text-muted-foreground">
                {platform === "desktop"
                  ? "Share this APK link with staff — open on an Android phone to install."
                  : "Native app — opens your shop, updates automatically from the cloud."}
              </p>
            </div>
            <Button asChild className="w-full h-14 text-base" size="lg">
              <a href={androidApkUrl} download="EzzyERP-1.1.0.apk">
                <Download className="mr-2 h-5 w-5" />
                Download EzzyERP for Android
              </a>
            </Button>
            {apkAvailable === false && (
              <p className="text-xs text-center text-destructive">
                APK file is not on the server yet. Deploy <span className="font-mono">public/downloads/EzzyERP-1.1.0.apk</span> to fix this.
              </p>
            )}
            <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
              <span className="text-xs flex-1 truncate font-mono">{androidApkUrl}</span>
              <Button variant="ghost" size="sm" className="shrink-0 h-8 px-2" onClick={copyApkLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-center text-muted-foreground">
              {platform === "desktop" ? (
                <>Version 1.1 · Open the APK link on an Android phone, then tap <strong>Install</strong> (not Open in browser).</>
              ) : (
                <>
                  1. Tap Download above · 2. Open notification or Files app · 3. Tap the APK · 4. Choose{" "}
                  <strong>Install</strong> (do not open in Chrome). Allow <strong>Install unknown apps</strong> if asked.
                </>
              )}
            </p>
            {platform === "android" && isInstallable && (
              <>
                <div className="pt-2 border-t text-center text-xs text-muted-foreground">or add to home screen (PWA)</div>
                <Button onClick={handleInstall} variant="outline" className="w-full" size="lg">
                  Install Web App Shortcut
                </Button>
              </>
            )}
            {platform === "android" && !isInstallable && (
              <p className="text-xs text-center text-muted-foreground">
                Prefer a home-screen shortcut? Chrome menu (⋮) → <strong>Install app</strong>
              </p>
            )}
            {platform !== "desktop" && (
              <div className="pt-2 border-t">
                <Button asChild variant="ghost" className="w-full" size="lg">
                  <a href={appStartUrl}>Open in Browser</a>
                </Button>
              </div>
            )}
          </Card>
        )}

        {/* Windows — desktop browsers only */}
        {!(isStandalone || isInstalled) && platform === "desktop" && (
          <Card className="p-6 space-y-4">
            <div className="text-center space-y-1">
              <h2 className="font-semibold text-lg">Download for Windows</h2>
              <p className="text-sm text-muted-foreground">
                Desktop app — opens like Tally/Vyapar, no browser needed.
              </p>
            </div>
            <Button asChild className="w-full h-14 text-base" size="lg">
              <a href={WINDOWS_SETUP_URL} download>
                <Download className="mr-2 h-5 w-5" />
                Download EzzyERP for Windows
              </a>
            </Button>
            <Button asChild variant="outline" className="w-full" size="sm">
              <a href={WINDOWS_PORTABLE_URL} download>
                Portable version (no install needed)
              </a>
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Windows 10/11 (64-bit). If Windows shows &quot;Unknown publisher&quot;, click{" "}
              <strong>More info → Run anyway</strong>.
            </p>
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
          {platform !== "ios" && (
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
