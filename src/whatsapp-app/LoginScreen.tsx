import { useState } from "react";
import { CheckCheck, Eye, EyeOff, Loader2, Megaphone, QrCode, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FEATURES = [
  { icon: QrCode, text: "Link your own WhatsApp number with a QR scan" },
  { icon: Megaphone, text: "Send offers and posters to all your customers" },
  { icon: Send, text: "Messages go one by one, safely spaced" },
  { icon: CheckCheck, text: "See who received and read every message" },
];

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setBusy(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setError(
        authError.message.includes("Invalid login credentials")
          ? "Wrong email or password"
          : authError.message,
      );
    }
    setBusy(false);
  };

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-11 w-11 rounded-xl shadow-lg" />
          <span className="text-xl font-bold tracking-tight">Ezzy WhatsApp</span>
        </div>
        <div className="relative space-y-6">
          <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            WhatsApp promotions from your own number
          </h1>
          <ul className="space-y-3">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-emerald-50">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-emerald-100/80">by Ezzy ERP</p>
      </div>

      <div className="flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-4 py-10">
        <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3 text-center lg:hidden">
            <img src="/icon.svg" alt="" className="h-14 w-14 rounded-2xl shadow-md" />
            <span className="text-xl font-bold tracking-tight text-slate-900">Ezzy WhatsApp</span>
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h2>
            <p className="text-sm text-slate-500">Use the login your Ezzy ERP admin gave you</p>
          </div>
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-1.5">
              <Label htmlFor="wa-email" className="text-xs font-medium text-slate-600">
                Email / Login ID
              </Label>
              <Input
                id="wa-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@shop.com"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-password" className="text-xs font-medium text-slate-600">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="wa-password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  title={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              disabled={busy}
              className="h-11 w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </div>
          <p className="text-center text-xs text-slate-500">Forgot your password? Ask your Ezzy ERP admin to reset it.</p>
        </form>
      </div>
    </div>
  );
}
