import { test, expect } from "./support/test";
import { E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Employee Master: Joining Date may be left blank (a blank date used to fail the save), and a
 * salesman gets the Field Sales app from the mobile number alone: "Create login" makes the
 * login (create-org-user) and links it. The Field Sales login page takes that mobile number.
 */

test("blank joining date saves; Create login makes and links the salesman's mobile login", async ({ page, backend }) => {
  await page.route("**/functions/v1/get-users", (route) => route.fulfill({ json: { users: [] } }));
  const created: Array<Record<string, unknown>> = [];
  await page.route("**/functions/v1/create-org-user", async (route) => {
    created.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({ json: { success: true, user: { id: "u-salesman", email: "x", role: "user" } } });
  });
  backend.keepInserts("employees");

  await page.goto(`/${E2E_ORG_SLUG}/employees`);
  await page.getByRole("button", { name: "Add Employee" }).click({ timeout: 60_000 });
  const dialog = page.getByRole("dialog");
  await dialog.locator("#employee_name").fill("NARAYAN");
  await dialog.locator("#phone").fill("+91 73859 90258");
  await dialog.getByRole("switch").click(); // Field Sales App Access

  const box = dialog.getByTestId("employee-mobile-login");
  await expect(box).toContainText("Login ID: mobile 7385990258");
  await expect(dialog.getByTestId("employee-create-mobile-login")).toBeDisabled();
  await dialog.locator("#field_sales_password").fill("narayan1");
  await dialog.getByTestId("employee-create-mobile-login").click();
  await expect(box).toBeHidden(); // linked: the create box goes away

  expect(created).toEqual([
    {
      email: `7385990258.${E2E_ORG_SLUG}@fieldsales.ezzy.shop`,
      password: "narayan1", // not uppercased
      role: "user",
      organizationId: expect.any(String),
    },
  ]);

  await dialog.getByRole("button", { name: "Create Employee" }).click();
  await expect(page.getByText("Employee created successfully").first()).toBeVisible();
  const insert = backend.calls.find((c) => c.kind === "insert" && c.name === "employees");
  const row = (Array.isArray(insert?.body) ? insert?.body[0] : insert?.body) as Record<string, unknown>;
  expect(row).toMatchObject({
    employee_name: "NARAYAN",
    joining_date: null,
    field_sales_access: true,
    user_id: "u-salesman",
  });
});

test("Field Sales login page signs in with a mobile number", async ({ page, backend }) => {
  void backend;
  const signIns: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/auth/v1/token") && req.method() === "POST") signIns.push(req.postData() || "");
  });
  await page.goto(`/${E2E_ORG_SLUG}/field-sales`);
  const id = page.getByPlaceholder("Mobile number or email");
  await expect(id).toBeVisible({ timeout: 60_000 });
  await id.fill("073859 90258");
  await page.locator("#password").fill("narayan1");
  await page.locator("form button[type=submit]").click();
  await expect.poll(() => signIns.find((b) => b.includes("fieldsales.ezzy.shop")) ?? "").toContain(
    `"email":"7385990258.${E2E_ORG_SLUG}@fieldsales.ezzy.shop"`,
  );
});
