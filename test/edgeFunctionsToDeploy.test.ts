import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import { listFunctions, pinnedFunctions, planDeploy } from "../scripts/edge-functions-to-deploy.mjs";

const toml = `
project_id = "x"

[functions.send-whatsapp]
verify_jwt = false

[functions.get-users]
verify_jwt = true # comment ok

[functions.no-flag]
import_map = "x"

[api]
verify_jwt = false
`;

describe("which edge functions a merge deploys", () => {
  const pinned = pinnedFunctions(toml);
  const all = ["get-users", "no-flag", "send-whatsapp", "mcp"];

  it("reads only functions whose verify_jwt is written down", () => {
    expect([...pinned].sort()).toEqual(["get-users", "send-whatsapp"]);
  });

  it("deploys changed functions, and holds back ones without a pinned JWT setting", () => {
    expect(
      planDeploy(
        ["supabase/functions/send-whatsapp/index.ts", "supabase/functions/mcp/tools.ts", "src/App.tsx", "supabase/migrations/1.sql"],
        all,
        pinned,
      ),
    ).toEqual({ deploy: ["send-whatsapp"], unpinned: ["mcp"] });
  });

  it("deploys every function when shared code changes, and skips deleted ones", () => {
    expect(planDeploy(["supabase/functions/_shared/cors.ts", "supabase/functions/gone/index.ts"], all, pinned)).toEqual({
      deploy: ["get-users", "send-whatsapp"],
      unpinned: ["mcp", "no-flag"],
    });
  });

  it("does nothing when no function changed", () => {
    expect(planDeploy(["src/pages/POSSales.tsx", ""], all, pinned)).toEqual({ deploy: [], unpinned: [] });
  });

  it("works on this repository's real functions and config", () => {
    const root = path.resolve(__dirname, "..");
    const fns = listFunctions(root);
    const real = pinnedFunctions(readFileSync(path.join(root, "supabase/config.toml"), "utf8"));
    expect(fns).toContain("send-whatsapp");
    expect(fns).not.toContain("_shared");
    expect(real.has("send-whatsapp")).toBe(true);
    const plan = planDeploy(["supabase/functions/send-whatsapp/index.ts"], fns, real);
    expect(plan.deploy).toEqual(["send-whatsapp"]);
  });
});
