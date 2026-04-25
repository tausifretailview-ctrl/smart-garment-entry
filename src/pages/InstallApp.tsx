import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Share, Plus, Smartphone, CheckCircle2, Copy, MessageCircle } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { toast } from "sonner";

type Platform = "android" | "ios" | "desktop" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  if (/iPhone|iPod/.test(ua) || isIPad) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Mobi/.test(ua)) return "other";
  return "desktop";
}

export default function InstallApp() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { isInstallable, isInstalled, promptInstall } = useInstallPrompt();
  const [orgName, setOrgName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const platform = detectPlatform();
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;

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
      if (data) setOrgName((data as any).name || "");
      setLoading(false);
    })();
  }, [orgSlug]);

  const installUrl = `${window.location.origin}/${orgSlug}/install`;
  const appStartUrl = `${window.location.origin}/${orgSlug}`;

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
    const text = `Install ${orgName || "our"} app on your phone:\n${installUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
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
            <p className="text-sm text-muted-foreground mt-1">Install the app on your phone</p>
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
              Scroll and tap <Plus className="h-4 w-4 text-primary" /> <strong>"Add to Home Screen"</strong>
            </div>

            <div className="pt-2 border-t">
              <Button asChild variant="outline" className="w-full" size="lg">
                <a href={appStartUrl}>Continue in Browser</a>
              </Button>
            </div>
          </Card>
        ) : platform === "android" || platform === "other" ? (
          <Card className="p-6 space-y-4">
            <Button onClick={handleInstall} className="w-full h-14 text-base" size="lg">
              <Download className="mr-2 h-5 w-5" />
              Install App
            </Button>
            {!isInstallable && (
              <p className="text-xs text-center text-muted-foreground">
                If install button doesn't trigger, open Chrome menu (⋮) and tap <strong>"Install app"</strong>
              </p>
            )}
            <div className="pt-2 border-t">
              <Button asChild variant="outline" className="w-full" size="lg">
                <a href={appStartUrl}>Open in Browser</a>
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6 space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Open this link on your phone to install the app.
            </p>
            <Button asChild className="w-full" size="lg">
              <a href={appStartUrl}>Open Web App</a>
            </Button>
          </Card>
        )}

        {/* Share section */}
        <Card className="p-4 space-y-3">
          <div className="text-sm font-semibold text-foreground">Share install link with team</div>
          <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
            <span className="text-xs flex-1 truncate font-mono">{installUrl}</span>
          </div>
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