import { describe, expect, it } from "vitest";
import { createFakeLedgerClient } from "../helpers/fakeLedgerSupabase";
import { buildMaseeraLedgerDb, MASEERA_CUSTOMER, MASEERA_ORG } from "../helpers/maseeraLedgerFixture";
import { diffLedgerRows } from "../helpers/customerLedgerExtractDualRun";
import { fetchCustomerLedgerTransactionsWithClient } from "@/utils/customerLedgerTransactions";
import { fetchCustomerLedgerTransactionsDesktopInline } from "../../scripts/lib/customerLedgerRetailInline.generated";
import { getLedgerLoadTimings } from "@/lib/ledgerLoadTiming";

/**
 * Wraps the fake client so no query answers until the test releases the current batch.
 * Each release is one network round trip; the number of releases is how many waits the
 * user sees in a row on "Loading ledger…".
 */
function gatedClient(db: ReturnType<typeof buildMaseeraLedgerDb>) {
  const inner = createFakeLedgerClient(db);
  const pending: Array<() => void> = [];
  const client = {
    from(table: string) {
      const q = inner.from(table) as unknown as Record<string, unknown>;
      const realThen = (q.then as (...a: unknown[]) => unknown).bind(q);
      q.then = (resolve?: unknown, reject?: unknown) =>
        new Promise((done) => {
          pending.push(() => done(realThen(resolve, reject)));
        });
      return q;
    },
  };
  return { client, pending };
}

async function countRoundTrips(run: (client: never) => Promise<unknown>): Promise<{ trips: number; queries: number }> {
  const { client, pending } = gatedClient(buildMaseeraLedgerDb());
  let finished = false;
  const p = run(client as never).finally(() => {
    finished = true;
  });
  let trips = 0;
  let queries = 0;
  for (let guard = 0; guard < 50 && !finished; guard++) {
    await new Promise((r) => setTimeout(r, 0));
    if (!pending.length) continue;
    trips += 1;
    queries += pending.length;
    pending.splice(0).forEach((release) => release());
  }
  await p;
  return { trips, queries };
}

describe("customer ledger load — parallel waves", () => {
  const dateRange = { startDate: new Date("2020-01-01"), endDate: null };

  it("waits for 2 round trips instead of one per query (date filter on)", async () => {
    const extracted = await countRoundTrips((client) =>
      fetchCustomerLedgerTransactionsWithClient(client, MASEERA_ORG, MASEERA_CUSTOMER, dateRange, 0),
    );
    const frozen = await countRoundTrips((client) =>
      fetchCustomerLedgerTransactionsDesktopInline(
        client,
        MASEERA_ORG,
        { id: MASEERA_CUSTOMER, opening_balance: 0 },
        dateRange.startDate,
        null,
      ),
    );
    expect(extracted.trips).toBe(2);
    expect(frozen.trips).toBeGreaterThanOrEqual(5);
    // Same work, only grouped: no query added or dropped.
    expect(extracted.queries).toBe(frozen.queries);
  });

  it("waits for 2 round trips without a date filter", async () => {
    const { trips } = await countRoundTrips((client) =>
      fetchCustomerLedgerTransactionsWithClient(client, MASEERA_ORG, MASEERA_CUSTOMER, undefined, 0),
    );
    expect(trips).toBe(2);
  });

  it("returns the same rows as the frozen sequential copy", async () => {
    const client = createFakeLedgerClient(buildMaseeraLedgerDb()) as never;
    for (const range of [undefined, dateRange]) {
      const extracted = await fetchCustomerLedgerTransactionsWithClient(client, MASEERA_ORG, MASEERA_CUSTOMER, range, 0);
      const frozen = await fetchCustomerLedgerTransactionsDesktopInline(
        client,
        MASEERA_ORG,
        { id: MASEERA_CUSTOMER, opening_balance: 0 },
        range?.startDate,
        null,
      );
      expect(extracted.length).toBeGreaterThan(0);
      expect(diffLedgerRows(extracted, frozen)).toEqual([]);
    }
  });

  it("records the load time in memory for __ezzyLedgerPerf.print()", async () => {
    const client = createFakeLedgerClient(buildMaseeraLedgerDb()) as never;
    const before = getLedgerLoadTimings().length;
    await fetchCustomerLedgerTransactionsWithClient(client, MASEERA_ORG, MASEERA_CUSTOMER, undefined, 0);
    const timings = getLedgerLoadTimings();
    expect(timings.length).toBe(Math.min(before + 1, 30));
    const last = timings[timings.length - 1];
    expect(last.customer).toBe(MASEERA_CUSTOMER.slice(0, 8));
    expect(last.totalMs).toBeGreaterThanOrEqual(0);
    expect(last.rows).toBeGreaterThan(0);
  });
});
