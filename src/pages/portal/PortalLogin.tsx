import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ShoppingBag, ArrowRight } from 'lucide-react';

const PORTAL_SESSION_KEY = 'portal_session';

export default function PortalLogin() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  const [orgInfo, setOrgInfo] = useState<{ name: string; logoUrl?: string; color?: string } | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [customerName, setCustomerName] = useState('');

  // Check existing session
  useEffect(() => {
    const stored = localStorage.getItem(PORTAL_SESSION_KEY);
    if (stored) {
      try {
        const session = JSON.parse(stored);
        if (session.orgSlug === orgSlug && session.expires > Date.now()) {
          navigate(`/${orgSlug}/portal/home`, { replace: true });
          return;
        }
      } catch { /* invalid stored data */ }
    }
  }, [orgSlug, navigate]);

  // Fetch org branding
  useEffect(() => {
    if (!orgSlug) return;
    const fetchOrg = async () => {
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('slug', orgSlug)
        .single();

      if (!org) { setOrgLoading(false); return; }

      const { data: settings } = await supabase
        .from('settings')
        .select('business_name, logo_url')
        .eq('organization_id', org.id)
        .single();

      setOrgInfo({
        name: (settings as any)?.business_name || org.name,
        logoUrl: (settings as any)?.logo_url,
      });
      setOrgLoading(false);
    };
    fetchOrg();
  }, [orgSlug]);

  const handleSendOTP = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    setLoading(true);
    try {
      const res = await supabase.functions.invoke('portal-auth', {
        body: { action: 'send_otp', orgSlug, phone: cleanPhone }
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || 'Failed to send OTP');
        return;
      }
      setCustomerName(res.data.customerName || '');
      setStep('otp');
      toast.success('OTP sent on WhatsApp');
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      toast.error('Enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    try {
      const res = await supabase.functions.invoke('portal-auth', {
        body: { action: 'verify_otp', orgSlug, phone: phone.replace(/\D/g, ''), otp }
      });
      if (res.error || res.data?.error) {
        toast.error(res.data?.error || 'Invalid OTP');
        return;
      }
      localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify({
        orgSlug,
        sessionToken: res.data.sessionToken,
        customerId: res.data.customerId,
        customerName: res.data.customerName,
        priceType: res.data.priceType,
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }));
      toast.success(`Welcome, ${res.data.customerName}!`);
      navigate(`/${orgSlug}/portal/home`, { replace: true });
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo + Business Name */}
        <div className="text-center space-y-3">
          {orgInfo?.logoUrl ? (
            <img src={orgInfo.logoUrl} alt={orgInfo?.name} className="h-16 mx-auto object-contain" />
          ) : (
            <div className="h-16 w-16 bg-green-600 rounded-2xl flex items-center justify-center mx-auto">
              <ShoppingBag className="h-8 w-8 text-white" />
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">{orgInfo?.name}</h1>
          <p className="text-sm text-muted-foreground">Buyer Portal</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-lg border p-6 space-y-5">
          {step === 'phone' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Mobile Number</label>
                <Input
                  type="tel"
                  placeholder="Enter 10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendOTP()}
                  className="h-12 text-base"
                  maxLength={10}
                  autoFocus
                />
              </div>
              <Button
                className="w-full h-12 text-base bg-green-600 hover:bg-green-700"
                onClick={handleSendOTP}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Send OTP on WhatsApp
                {!loading && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                OTP will be sent to your WhatsApp
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {customerName && (
                <p className="text-center text-sm text-gray-600">
                  Hello, <span className="font-semibold">{customerName}</span> 👋
                </p>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Enter OTP</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="------"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOTP()}
                  className="h-12 text-base text-center tracking-[0.4em] text-xl font-mono"
                  autoFocus
                />
                <p className="text-xs text-center text-muted-foreground">
                  OTP sent to +91 {phone.replace(/\D/g, '')}
                </p>
              </div>
              <Button
                className="w-full h-12 text-base bg-green-600 hover:bg-green-700"
                onClick={handleVerifyOTP}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Verify & Login
              </Button>
              <button
                type="button"
                onClick={() => { setStep('phone'); setOtp(''); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Change number
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
