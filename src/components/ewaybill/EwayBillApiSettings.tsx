import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Truck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeEwayBill, type EwbApiKeys } from "@/utils/ewayBill";

type Props = {
  organizationId: string | undefined;
  /** The shop's E-Invoice Settings (the e-way bill keys sit beside the e-invoice ones). */
  value: EwbApiKeys | null | undefined;
  onChange: (patch: EwbApiKeys) => void;
};

/**
 * Industrial mode, Phase 2 step 5b: PeriOne's e-way bill API keys, used to add or change
 * the vehicle, cancel and extend e-way bills. Different from the e-invoice keys; the API
 * email and GSTIN above are shared.
 */
export function EwayBillApiSettings({ organizationId, value, onChange }: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const v = value ?? {};

  const test = async () => {
    if (!organizationId || testing) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await invokeEwayBill({ action: "test", organizationId });
      setResult({ ok: !!res.success, text: res.success ? res.message || "E-way bill login works." : res.error || "Login failed" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-teal-200 bg-teal-50/40 p-4">
      <div>
        <h4 className="flex items-center gap-2 font-medium">
          <Truck className="h-4 w-4 text-teal-700" />
          E-way bill API (PeriOne)
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">
          PeriOne gives separate keys for e-way bills. With them, you can add or change the vehicle, cancel and extend
          e-way bills from Ezzy ERP. The API email and GSTIN above are used too.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ewb_api_client_id">E-way bill Client ID</Label>
          <Input
            id="ewb_api_client_id"
            className="no-uppercase font-mono"
            value={v.ewb_api_client_id || ""}
            onChange={(e) => onChange({ ewb_api_client_id: e.target.value.trim() })}
            placeholder="From PeriOne"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ewb_api_client_secret">E-way bill Client Secret</Label>
          <div className="relative">
            <Input
              id="ewb_api_client_secret"
              type={showSecret ? "text" : "password"}
              className="no-uppercase pr-10 font-mono"
              value={v.ewb_api_client_secret || ""}
              onChange={(e) => onChange({ ewb_api_client_secret: e.target.value.trim() })}
              placeholder="••••••••••••••••"
              autoComplete="new-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowSecret((s) => !s)}
              aria-label={showSecret ? "Hide" : "Show"}
            >
              {showSecret ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ewb_api_username">E-way bill username</Label>
          <Input
            id="ewb_api_username"
            className="no-uppercase"
            value={v.ewb_api_username || ""}
            onChange={(e) => onChange({ ewb_api_username: e.target.value.trim() })}
            placeholder="E-way bill API user"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ewb_api_password">E-way bill password</Label>
          <div className="relative">
            <Input
              id="ewb_api_password"
              type={showPassword ? "text" : "password"}
              className="no-uppercase pr-10"
              value={v.ewb_api_password || ""}
              onChange={(e) => onChange({ ewb_api_password: e.target.value })}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide" : "Show"}
            >
              {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => void test()} disabled={testing || !organizationId}>
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
          Test e-way bill login
        </Button>
        {result ? (
          <span className={`flex items-center gap-1.5 text-sm font-medium ${result.ok ? "text-green-700" : "text-destructive"}`}>
            {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {result.text}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Save the settings first, then test. Sandbox or live follows Test Mode above.</span>
        )}
      </div>
    </div>
  );
}
