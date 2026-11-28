import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_USER_ID } from "./support/mockBackend";

/**
 * Field Sales live location.
 *  - Owner: Salesman Location lists each salesman with Live / last seen, the area name (from
 *    OpenStreetMap, answered here) and a Google Maps link; a day's points show as places.
 *  - Salesman phone (browser fallback here): inside work hours a one-time notice, then points
 *    are sent; after work hours nothing is asked and nothing is sent.
 */
const nominatimAnswer = (lat: number) => ({
  address: lat > 19.05 ? { suburb: "Bandra West", city: "Mumbai" } : { suburb: "Dadar West", city: "Mumbai" },
});

test.describe("owner screen", () => {
  test("Salesman Location: live / last seen, area name, Google Maps link, day's places", async ({ page, backend }) => {
    const now = Date.now();
    backend.tables.settings[0].sale_settings = { salesman_tracking: { enabled: true, start: "10:00", end: "20:00" } };
    backend.onRpc("get_salesman_live_locations", () => [
      { user_id: "u1", employee_name: "RAHUL", lat: 19.0176, lng: 72.8562, accuracy_m: 12, recorded_at: new Date(now - 2 * 60_000).toISOString(), source: "background", points_today: 40 },
      { user_id: "u2", employee_name: "AMIT", lat: 19.0596, lng: 72.8295, accuracy_m: 30, recorded_at: new Date(now - 3 * 3_600_000).toISOString(), source: "background", points_today: 5 },
      { user_id: "u3", employee_name: "NEW BOY", lat: null, lng: null, accuracy_m: null, recorded_at: null, source: null, points_today: 0 },
    ]);
    backend.onRpc("get_salesman_location_trail", () => [
      { lat: 19.0176, lng: 72.8562, accuracy_m: 10, recorded_at: new Date(now - 90 * 60_000).toISOString() },
      { lat: 19.0177, lng: 72.8563, accuracy_m: 10, recorded_at: new Date(now - 80 * 60_000).toISOString() },
      { lat: 19.0596, lng: 72.8295, accuracy_m: 10, recorded_at: new Date(now - 30 * 60_000).toISOString() },
    ]);
    const geocodeCalls: string[] = [];
    await page.route("https://nominatim.openstreetmap.org/**", (route) => {
      const url = new URL(route.request().url());
      geocodeCalls.push(url.search);
      return route.fulfill({ json: nominatimAnswer(Number(url.searchParams.get("lat"))) });
    });

    await page.goto(`/${E2E_ORG_SLUG}/salesman-locations`);
    const rows = page.getByTestId("salesman-location-row");
    await expect(rows).toHaveCount(3, { timeout: 60_000 });
    await expect(page.getByText(/between 10:00 AM and 8:00 PM/)).toBeVisible();

    const rahul = rows.filter({ hasText: "RAHUL" });
    await expect(rahul).toContainText("Live");
    await expect(rahul.getByTestId("salesman-area")).toHaveText("Dadar West, Mumbai");
    await expect(rahul.getByRole("link", { name: /Open in Google Maps/ })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=19.017600,72.856200",
    );
    const amit = rows.filter({ hasText: "AMIT" });
    await expect(amit).toContainText(/Last seen 3 hours ago/);
    await expect(amit.getByTestId("salesman-area")).toHaveText("Bandra West, Mumbai");
    await expect(rows.filter({ hasText: "NEW BOY" })).toContainText("No location yet");

    await rahul.getByRole("button", { name: /Day's places/ }).click();
    const trail = rahul.getByTestId("salesman-trail");
    await expect(trail.locator("li")).toHaveCount(2); // the two close points are one place
    await expect(trail.locator("li").first()).toContainText("Dadar West, Mumbai");
    await expect(trail.getByRole("link", { name: /Route in Google Maps/ })).toHaveAttribute("href", /maps\/dir\/\?api=1/);
    // One lookup per ~100 m area: the repeated Dadar point is answered from the cache.
    expect(geocodeCalls.length).toBeLessThanOrEqual(2);
  });
});

test.describe("salesman phone", () => {
  test.use({ permissions: ["geolocation"], geolocation: { latitude: 19.0176, longitude: 72.8562, accuracy: 15 } });

  const salesman = { id: "e1", organization_id: E2E_ORG_ID, user_id: E2E_USER_ID, employee_name: "JAVED BHAI", field_sales_access: true, status: "active", deleted_at: null };

  test("inside work hours: notice once, then the position is sent", async ({ page, backend }) => {
    await page.clock.install({ time: new Date("2026-11-24T12:00:00+05:30") });
    backend.addRows("employees", [salesman]);
    backend.tables.settings[0].sale_settings = { salesman_tracking: { enabled: true, start: "10:00", end: "20:00" } };
    backend.onRpc("record_salesman_locations", (args) => (args.p_points as unknown[]).length);

    await page.goto(`/${E2E_ORG_SLUG}/salesman`);
    const notice = page.getByTestId("field-sales-location-consent");
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await expect(notice).toContainText("10:00 AM");
    await expect(notice).toContainText("8:00 PM");
    expect(backend.rpcCalls("record_salesman_locations")).toHaveLength(0);

    await notice.getByRole("button", { name: "Allow" }).click();
    await expect(page.getByTestId("field-sales-location-status")).toHaveText(/Location on/);
    await page.clock.fastForward(61_000);
    await expect.poll(() => backend.rpcCalls("record_salesman_locations").length).toBeGreaterThan(0);
    const [call] = backend.rpcCalls("record_salesman_locations") as Array<{ p_organization_id: string; p_points: Array<Record<string, unknown>> }>;
    expect(call.p_organization_id).toBe(E2E_ORG_ID);
    expect(call.p_points[0]).toMatchObject({ lat: 19.0176, lng: 72.8562, source: "foreground" });

    // Accepted once: no notice on the next visit.
    await page.reload();
    await expect(page.getByTestId("field-sales-location-status")).toHaveText(/Location on/, { timeout: 60_000 });
    await expect(notice).toHaveCount(0);
  });

  test("after work hours: asked once, then nothing is sent until the hours start", async ({ page, backend }) => {
    await page.clock.install({ time: new Date("2026-11-24T21:00:00+05:30") });
    backend.addRows("employees", [salesman]);
    backend.tables.settings[0].sale_settings = { salesman_tracking: { enabled: true, start: "10:00", end: "20:00" } };
    await page.goto(`/${E2E_ORG_SLUG}/salesman`);
    const notice = page.getByTestId("field-sales-location-consent");
    await expect(notice).toBeVisible({ timeout: 60_000 });
    await notice.getByRole("button", { name: "Allow" }).click();
    await expect(notice).toHaveCount(0);
    await expect(page.getByTestId("field-sales-location-status")).toHaveText("Location from 10:00 AM to 8:00 PM");
    await page.clock.fastForward(61_000);
    expect(backend.rpcCalls("record_salesman_locations")).toHaveLength(0);
  });

  test("switched on in Settings while the app is open: asked when the app comes back to the front", async ({ page, backend }) => {
    await page.clock.install({ time: new Date("2026-11-24T12:00:00+05:30") });
    backend.addRows("employees", [salesman]);
    backend.tables.settings[0].sale_settings = {};
    await page.goto(`/${E2E_ORG_SLUG}/salesman`);
    await expect(page.getByTestId("field-sales-app")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("field-sales-location-consent")).toHaveCount(0);

    // The owner turns it on; the salesman switches back to the app.
    backend.tables.settings[0].sale_settings = { salesman_tracking: { enabled: true, start: "10:00", end: "20:00" } };
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByTestId("field-sales-location-consent")).toBeVisible({ timeout: 15_000 });
  });
});
