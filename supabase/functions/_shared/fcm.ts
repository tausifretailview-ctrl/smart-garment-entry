// FCM HTTP v1 sender (service-account JWT). Same flow as push-send; shared so
// owner alerts do not duplicate the signing code.
// Native Android (Capacitor) needs a `notification` block: Android shows it from the
// system tray when the app is closed, and a data-only message would show nothing.
// (Web pushes are different: there the service worker shows them, see push-send.)

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function base64UrlEncode(data: Uint8Array): string {
  let s = "";
  for (let i = 0; i < data.length; i++) s += String.fromCharCode(data[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedToken: { token: string; exp: number } | null = null;

export async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const enc = new TextEncoder();
  const header = base64UrlEncode(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64UrlEncode(
    enc.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key) as unknown as BufferSource,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${claims}`));
  const assertion = `${header}.${claims}.${base64UrlEncode(new Uint8Array(sig))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`OAuth token mint failed: ${res.status}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
  return cachedToken.token;
}

export function parseServiceAccount(raw: string | undefined | null): ServiceAccount | null {
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

export type FcmSendResult = { ok: true; name: string | null } | { ok: false; error: string; unregistered: boolean };

/** Send one Android notification (shown by the system tray even when the app is closed). */
export async function sendFcmAndroidNotification(
  sa: ServiceAccount,
  token: string,
  notification: { title: string; body: string },
  data: Record<string, string>,
  channelId = "owner_alerts",
): Promise<FcmSendResult> {
  try {
    const accessToken = await getFcmAccessToken(sa);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        message: {
          token,
          notification,
          data,
          android: { priority: "high", notification: { channel_id: channelId } },
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = `FCM ${res.status}: ${JSON.stringify(body).slice(0, 200)}`;
      return { ok: false, error, unregistered: /NOT_FOUND|UNREGISTERED|INVALID_ARGUMENT/i.test(error) };
    }
    return { ok: true, name: (body as { name?: string }).name ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "send_failed", unregistered: false };
  }
}
