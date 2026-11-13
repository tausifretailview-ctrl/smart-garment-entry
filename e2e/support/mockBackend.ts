import type { Page, Route } from "@playwright/test";

/**
 * Fake Supabase for the browser tests. The app is started with VITE_SUPABASE_URL set to this
 * address (playwright.config.ts), and `install()` answers every request to it from in-memory
 * tables. Any request to another host (live Supabase included) is aborted and recorded in
 * `blocked`, so a test can prove it never left the machine.
 */
export const E2E_SUPABASE_URL = "https://e2e-mock.supabase.invalid";
/** supabase-js keeps the session under sb-<first label of the host>-auth-token. */
const AUTH_STORAGE_KEY = "sb-e2e-mock-auth-token";

export const E2E_USER_ID = "11111111-1111-4111-8111-111111111111";
export const E2E_ORG_ID = "22222222-2222-4222-8222-222222222222";
export const E2E_ORG_SLUG = "demo";

type Row = Record<string, unknown>;
/** Return the RPC result, or a Promise of it to make the reply slow (e.g. a busy database). */
export type RpcHandler = (args: Record<string, unknown>) => unknown;
export type RecordedCall = { kind: "rpc" | "insert" | "update" | "upsert" | "delete" | "function"; name: string; body: unknown };

function fakeJwt(sub: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 86_400;
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", aud: "authenticated", exp })}.e2e`;
}

export const e2eUser = {
  id: E2E_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "cashier@e2e.test",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

export const e2eOrganization: Row = {
  id: E2E_ORG_ID,
  name: "E2E Demo Shop",
  slug: E2E_ORG_SLUG,
  subscription_tier: "enterprise",
  enabled_features: [],
  organization_type: "retail",
  organization_number: 1,
  is_suspended: false,
  suspension_reason: null,
  settings: {},
};

/** Tables every signed-in screen reads. Tests add their own rows with `table()` / `addRows()`. */
function baseTables(): Record<string, Row[]> {
  return {
    organization_members: [
      { id: "m1", organization_id: E2E_ORG_ID, user_id: E2E_USER_ID, role: "admin", organizations: e2eOrganization },
    ],
    organizations: [e2eOrganization],
    user_roles: [{ user_id: E2E_USER_ID, role: "admin", organization_id: E2E_ORG_ID }],
    settings: [
      {
        organization_id: E2E_ORG_ID,
        sale_settings: {},
        purchase_settings: {},
        bill_barcode_settings: {},
        // No GL posting: the ledger has its own unit tests and would need a full chart of accounts here.
        accounting_engine_enabled: false,
      },
    ],
  };
}

export class MockBackend {
  readonly tables: Record<string, Row[]> = baseTables();
  readonly rpcHandlers: Record<string, RpcHandler> = {};
  /** Every write and RPC the app sent, in order. */
  readonly calls: RecordedCall[] = [];
  /** Requests to any host other than the app and the fake Supabase (all aborted). */
  readonly blocked: string[] = [];

  addRows(table: string, rows: Row[]): this {
    (this.tables[table] ??= []).push(...rows);
    return this;
  }

  onRpc(name: string, handler: RpcHandler): this {
    this.rpcHandlers[name] = handler;
    return this;
  }

  rpcCalls(name: string): Record<string, unknown>[] {
    return this.calls.filter((c) => c.kind === "rpc" && c.name === name).map((c) => c.body as Record<string, unknown>);
  }

  /** Answers every request of `page`, and signs the e2e cashier in before the app boots. */
  async install(page: Page, baseURL: string): Promise<void> {
    const appOrigin = new URL(baseURL).origin;
    await page.route("**/*", (route) => this.handle(route, appOrigin));
    // page.route only sees HTTP. Supabase realtime (and anything else) opens WebSockets,
    // which would otherwise go straight to the network: close them here, and record any
    // that are not for the fake Supabase.
    await page.routeWebSocket(/.*/, (ws) => {
      const host = new URL(ws.url()).host;
      if (host !== new URL(E2E_SUPABASE_URL).host && !ws.url().startsWith(appOrigin.replace(/^http/, "ws"))) {
        this.blocked.push(host);
      }
      if (ws.url().startsWith(appOrigin.replace(/^http/, "ws"))) {
        ws.connectToServer(); // Vite's hot-reload socket on the app's own origin
        return;
      }
      void ws.close();
    });
    await page.addInitScript(
      ({ key, session, orgKey, orgId }) => {
        localStorage.setItem(key, JSON.stringify(session));
        localStorage.setItem(orgKey, orgId);
      },
      {
        key: AUTH_STORAGE_KEY,
        session: {
          access_token: fakeJwt(E2E_USER_ID),
          refresh_token: "e2e-refresh",
          token_type: "bearer",
          expires_in: 86_400,
          expires_at: Math.floor(Date.now() / 1000) + 86_400,
          user: e2eUser,
        },
        orgKey: `currentOrgId_${E2E_USER_ID}`,
        orgId: E2E_ORG_ID,
      },
    );
  }

  private async handle(route: Route, appOrigin: string): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === appOrigin || url.protocol === "data:" || url.protocol === "blob:") return route.continue();
    if (url.origin !== E2E_SUPABASE_URL) {
      this.blocked.push(url.host);
      return route.abort();
    }
    const path = url.pathname;
    if (path.startsWith("/auth/v1/user")) return route.fulfill({ json: e2eUser });
    if (path.startsWith("/auth/v1/")) {
      return route.fulfill({
        json: { access_token: fakeJwt(E2E_USER_ID), token_type: "bearer", expires_in: 86_400, refresh_token: "e2e-refresh", user: e2eUser },
      });
    }
    if (path.startsWith("/realtime/")) return route.abort();
    if (path.startsWith("/functions/v1/")) {
      this.calls.push({ kind: "function", name: path.slice("/functions/v1/".length), body: parseBody(request.postData()) });
      return route.fulfill({ json: {} });
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.slice("/rest/v1/rpc/".length);
      const body = (parseBody(request.postData()) ?? {}) as Record<string, unknown>;
      this.calls.push({ kind: "rpc", name, body });
      const handler = this.rpcHandlers[name];
      const result = handler ? await handler(body) : null;
      return route.fulfill({ json: result ?? null });
    }
    if (path.startsWith("/rest/v1/")) {
      const table = path.slice("/rest/v1/".length);
      const method = request.method();
      if (method === "GET" || method === "HEAD") return this.select(route, table, url);
      const kind = method === "DELETE" ? "delete" : method === "PATCH" ? "update" : (request.headers()["prefer"] || "").includes("merge-duplicates") ? "upsert" : "insert";
      const body = parseBody(request.postData());
      this.calls.push({ kind, name: table, body });
      // Like the database: an inserted row comes back with an id.
      const rows = (Array.isArray(body) ? body : body ? [body] : []).map((row, i) =>
        kind === "insert" && row && typeof row === "object" && !("id" in row)
          ? { id: `${table}-${this.calls.length}-${i + 1}`, ...(row as Row) }
          : row,
      );
      const single = (request.headers()["accept"] || "").includes("vnd.pgrst.object");
      return route.fulfill({ json: single ? (rows[0] ?? {}) : rows });
    }
    return route.abort();
  }

  /** Very small PostgREST: `col=eq.value` filters on the table's rows; everything else ignored. */
  private select(route: Route, table: string, url: URL): Promise<void> {
    let rows = this.tables[table] ?? [];
    for (const [col, raw] of url.searchParams) {
      if (["select", "order", "limit", "offset", "or", "and"].includes(col)) continue;
      const m = /^eq\.(.*)$/.exec(raw);
      if (!m) continue;
      rows = rows.filter((r) => !(col in r) || String(r[col]) === m[1]);
    }
    const single = (route.request().headers()["accept"] || "").includes("vnd.pgrst.object");
    if (single) {
      return rows.length
        ? route.fulfill({ json: rows[0] })
        : route.fulfill({ status: 406, json: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } });
    }
    return route.fulfill({ json: rows, headers: { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  }
}

function parseBody(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
