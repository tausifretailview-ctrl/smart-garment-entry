import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { joinQrLink } from "../../../supabase/functions/_shared/whatsappJoin";

/** Printable A5-ish poster: shop name, the QR and one line on what the customer gets. */
async function posterDataUrl(qrLink: string, shopName: string, points: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1748;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0f6b55";
  ctx.fillRect(0, 0, canvas.width, 260);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 84px sans-serif";
  ctx.fillText((shopName || "Our shop").slice(0, 26), canvas.width / 2, 165);
  ctx.fillStyle = "#1d2420";
  ctx.font = "bold 76px sans-serif";
  ctx.fillText("Scan to join us on WhatsApp", canvas.width / 2, 420);
  const qr = new Image();
  qr.src = await QRCode.toDataURL(qrLink, { width: 820, margin: 1 });
  await new Promise((resolve) => {
    qr.onload = resolve;
    qr.onerror = resolve;
  });
  ctx.drawImage(qr, (canvas.width - 820) / 2, 500, 820, 820);
  ctx.font = "52px sans-serif";
  ctx.fillStyle = "#3a4540";
  ctx.fillText(points > 0 ? `Get ${points} welcome points + new arrivals & offers` : "Get new arrivals & special offers first", canvas.width / 2, 1440);
  ctx.font = "44px sans-serif";
  ctx.fillText("Scan, then tap Send on the JOIN message", canvas.width / 2, 1530);
  return canvas.toDataURL("image/png");
}

/**
 * Settings > WhatsApp > Automatic messages: the counter "Scan to join" QR for the linked
 * Ezzy ERP WhatsApp number, with a poster to download and print.
 */
export function JoinQrCard({ shopName, points }: { shopName: string; points: number }) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const [qr, setQr] = useState("");

  const { data: wa } = useQuery({
    queryKey: ["whatsapp-join-qr-number", orgId],
    queryFn: async () => {
      const { data } = await (supabase.from("whatsapp_api_settings") as any)
        .select("send_provider, builtin_connected_number")
        .eq("organization_id", orgId)
        .maybeSingle();
      return (data ?? null) as { send_provider?: string | null; builtin_connected_number?: string | null } | null;
    },
    enabled: !!orgId,
  });

  const link = wa?.send_provider === "builtin" ? joinQrLink(wa?.builtin_connected_number) : "";

  useEffect(() => {
    let cancelled = false;
    if (!link) {
      setQr("");
      return;
    }
    void QRCode.toDataURL(link, { width: 220, margin: 1 }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [link]);

  if (!link) {
    return (
      <p className="text-xs text-muted-foreground">
        The join QR appears here once Ezzy ERP WhatsApp is connected in WhatsApp API above.
      </p>
    );
  }

  const download = async () => {
    const url = await posterDataUrl(link, shopName, points);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "whatsapp-join-qr.png";
    a.click();
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {qr && <img src={qr} alt="Scan to join on WhatsApp" className="h-28 w-28 rounded border bg-white p-1" />}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          Opens WhatsApp to +{wa?.builtin_connected_number} with JOIN typed in. Customers who send it are saved in Customer Master.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void download()}>
          <Download className="mr-2 h-4 w-4" /> Download poster
        </Button>
      </div>
    </div>
  );
}
