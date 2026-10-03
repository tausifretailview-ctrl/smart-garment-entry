import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultClient } from "@/integrations/supabase/client";
import { normalizePhoneNumber } from "@/utils/excelImportUtils";

/** Sale header party fields. Customer Master does not read these on its own. */
export type SalePartyInput = {
  id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
};

export type ExistingCustomerRef = {
  id: string;
  customer_name?: string | null;
  phone?: string | null;
};

export type PlannedCustomerCreate = {
  customer_name: string;
  phone: string | null;
  saleIds: string[];
};

export type PlannedCustomerLink = {
  customerId: string;
  saleIds: string[];
  /** Fill this phone onto a master row that does not have one yet. */
  phoneToSet?: string | null;
};

const SALE_PAGE = 1000;
const CUSTOMER_PAGE = 1000;
const WRITE_CHUNK = 80;

const syncByOrg = new Map<string, Promise<{ created: number; linked: number }>>();

export function canonicalCustomerName(name?: string | null): string {
  return (name || "").trim().replace(/\s+/g, " ").toUpperCase();
}

/** Blank and walk-in labels are not Customer Master parties. */
export function isWalkInCustomerName(name?: string | null): boolean {
  const n = canonicalCustomerName(name).replace(/-/g, " ");
  return !n || n === "WALK IN CUSTOMER" || n === "WALK IN" || n === "WALKIN" || n === "WALKIN CUSTOMER";
}

function chooseDisplayName(names: string[], phone: string | null): string {
  const counts = new Map<string, number>();
  for (const name of names) {
    const key = canonicalCustomerName(name);
    if (!key || isWalkInCustomerName(key)) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount || (count === bestCount && name.length > best.length)) {
      best = name;
      bestCount = count;
    }
  }
  return best || phone || "";
}

/**
 * Decide which unlinked sale parties need a Customer Master row.
 * Same mobile is one customer. A typed name with no mobile links only when
 * exactly one master row has that name. Walk-in bills are skipped.
 */
export function planUnlinkedSaleParties(
  sales: SalePartyInput[],
  customers: ExistingCustomerRef[],
): { creates: PlannedCustomerCreate[]; links: PlannedCustomerLink[] } {
  const phoneToCustomer = new Map<string, ExistingCustomerRef>();
  const nameToCustomers = new Map<string, ExistingCustomerRef[]>();

  for (const customer of customers) {
    const phone = normalizePhoneNumber(customer.phone);
    if (phone && !phoneToCustomer.has(phone)) phoneToCustomer.set(phone, customer);
    const name = canonicalCustomerName(customer.customer_name);
    if (!name || isWalkInCustomerName(name)) continue;
    const list = nameToCustomers.get(name) || [];
    list.push(customer);
    nameToCustomers.set(name, list);
  }

  const creates = new Map<string, PlannedCustomerCreate & { names: string[] }>();
  const linkMap = new Map<string, PlannedCustomerLink & { existingPhone: string | null }>();

  const addLink = (
    customer: ExistingCustomerRef,
    saleId: string,
    phoneToSet?: string | null,
  ) => {
    const current = linkMap.get(customer.id) || {
      customerId: customer.id,
      saleIds: [],
      phoneToSet: null,
      existingPhone: normalizePhoneNumber(customer.phone) || null,
    };
    current.saleIds.push(saleId);
    if (phoneToSet && !current.existingPhone && !current.phoneToSet) {
      current.phoneToSet = phoneToSet;
    }
    linkMap.set(customer.id, current);
  };

  for (const sale of sales) {
    if (sale.customer_id) continue;
    if (isWalkInCustomerName(sale.customer_name)) continue;
    const name = canonicalCustomerName(sale.customer_name);
    const phone = normalizePhoneNumber(sale.customer_phone) || null;
    if (!name && !phone) continue;

    if (phone && phoneToCustomer.has(phone)) {
      addLink(phoneToCustomer.get(phone)!, sale.id);
      continue;
    }

    if (phone) {
      const named = name ? nameToCustomers.get(name) || [] : [];
      const phoneless = named.filter((customer) => !normalizePhoneNumber(customer.phone));
      if (named.length === 1 && phoneless.length === 1) {
        addLink(phoneless[0], sale.id, phone);
        phoneToCustomer.set(phone, phoneless[0]);
        continue;
      }

      const key = `p:${phone}`;
      const bucket = creates.get(key) || {
        customer_name: name,
        phone,
        saleIds: [],
        names: [],
      };
      bucket.saleIds.push(sale.id);
      if (name) bucket.names.push(name);
      creates.set(key, bucket);
      continue;
    }

    const existing = nameToCustomers.get(name) || [];
    if (existing.length === 1) {
      addLink(existing[0], sale.id);
      continue;
    }
    if (existing.length > 1) continue;

    const pending = [...creates.values()].filter(
      (bucket) => canonicalCustomerName(bucket.customer_name) === name || bucket.names.includes(name),
    );
    if (pending.length === 1) {
      pending[0].saleIds.push(sale.id);
      continue;
    }
    if (pending.length > 1) continue;

    const key = `n:${name}`;
    const bucket = creates.get(key) || {
      customer_name: name,
      phone: null,
      saleIds: [],
      names: [],
    };
    bucket.saleIds.push(sale.id);
    if (name) bucket.names.push(name);
    creates.set(key, bucket);
  }

  return {
    creates: [...creates.values()]
      .map((bucket) => ({
        customer_name: chooseDisplayName(
          bucket.names.length ? bucket.names : [bucket.customer_name],
          bucket.phone,
        ),
        phone: bucket.phone,
        saleIds: bucket.saleIds,
      }))
      .filter((bucket) => bucket.customer_name && bucket.saleIds.length > 0),
    links: [...linkMap.values()].map(({ customerId, saleIds, phoneToSet }) => ({
      customerId,
      saleIds,
      phoneToSet: phoneToSet || null,
    })),
  };
}

async function loadCandidateCustomers(
  client: SupabaseClient,
  organizationId: string,
  customerName: string | null,
  phone: string | null,
): Promise<ExistingCustomerRef[]> {
  const byId = new Map<string, ExistingCustomerRef>();
  const remember = (rows: ExistingCustomerRef[] | null) => {
    for (const row of rows || []) {
      if (row?.id) byId.set(row.id, row);
    }
  };

  if (phone) {
    const { data, error } = await client
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", organizationId)
      .ilike("phone", `%${phone.slice(-10)}`)
      .is("deleted_at", null)
      .limit(20);
    if (error) throw error;
    remember((data || []) as ExistingCustomerRef[]);
  }

  if (customerName) {
    const { data, error } = await client
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", organizationId)
      .eq("customer_name", customerName)
      .is("deleted_at", null)
      .limit(20);
    if (error) throw error;
    remember((data || []) as ExistingCustomerRef[]);
  }

  return [...byId.values()];
}

async function insertPlannedCustomers(
  client: SupabaseClient,
  organizationId: string,
  creates: PlannedCustomerCreate[],
): Promise<Map<string, string>> {
  const idBySale = new Map<string, string>();
  for (let i = 0; i < creates.length; i += WRITE_CHUNK) {
    const chunk = creates.slice(i, i + WRITE_CHUNK);
    const rows = chunk.map((create) => ({
      customer_name: create.customer_name,
      phone: create.phone,
      organization_id: organizationId,
      opening_balance: 0,
      discount_percent: 0,
    }));
    const { data, error } = await client
      .from("customers")
      .insert(rows)
      .select("id, customer_name, phone");
    if (error) throw error;
    const inserted = (data || []) as ExistingCustomerRef[];
    for (const create of chunk) {
      const match = inserted.find((row) => {
        const rowPhone = normalizePhoneNumber(row.phone) || null;
        if (create.phone) return rowPhone === create.phone;
        return canonicalCustomerName(row.customer_name) === create.customer_name && !rowPhone;
      });
      if (!match?.id) continue;
      for (const saleId of create.saleIds) idBySale.set(saleId, match.id);
    }
  }
  return idBySale;
}

async function linkSalesToCustomer(
  client: SupabaseClient,
  organizationId: string,
  customerId: string,
  saleIds: string[],
): Promise<void> {
  const realIds = saleIds.filter((id) => id && id !== "bill");
  for (let i = 0; i < realIds.length; i += WRITE_CHUNK) {
    const chunk = realIds.slice(i, i + WRITE_CHUNK);
    const { error } = await client
      .from("sales")
      .update({ customer_id: customerId })
      .in("id", chunk)
      .eq("organization_id", organizationId)
      .is("customer_id", null)
      .is("deleted_at", null);
    if (error) throw error;
  }
}

/**
 * Link one bill's typed name and mobile to Customer Master.
 * Returns null for walk-in. Reuses a customer with the same mobile.
 */
export async function linkOrCreateCustomerFromSaleParty(
  client: SupabaseClient,
  params: {
    organizationId: string;
    customerName?: string | null;
    customerPhone?: string | null;
  },
): Promise<string | null> {
  if (isWalkInCustomerName(params.customerName)) return null;
  const name = canonicalCustomerName(params.customerName);
  const phone = normalizePhoneNumber(params.customerPhone) || null;
  if (!name && !phone) return null;

  const existing = await loadCandidateCustomers(client, params.organizationId, name || null, phone);
  const plan = planUnlinkedSaleParties(
    [{ id: "bill", customer_name: params.customerName, customer_phone: params.customerPhone }],
    existing,
  );

  const link = plan.links[0];
  if (link) {
    if (link.phoneToSet) {
      const { error } = await client
        .from("customers")
        .update({ phone: link.phoneToSet })
        .eq("id", link.customerId)
        .eq("organization_id", params.organizationId)
        .is("phone", null);
      if (error) throw error;
    }
    return link.customerId;
  }

  const create = plan.creates[0];
  if (!create) return null;
  const { data, error } = await client
    .from("customers")
    .insert({
      customer_name: create.customer_name,
      phone: create.phone,
      organization_id: params.organizationId,
      opening_balance: 0,
      discount_percent: 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data?.id as string) || null;
}

async function loadAllCustomers(
  client: SupabaseClient,
  organizationId: string,
): Promise<ExistingCustomerRef[]> {
  const rows: ExistingCustomerRef[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from("customers")
      .select("id, customer_name, phone")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .range(from, from + CUSTOMER_PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as ExistingCustomerRef[];
    rows.push(...batch);
    if (batch.length < CUSTOMER_PAGE) break;
    from += CUSTOMER_PAGE;
  }
  return rows;
}

async function loadUnlinkedSales(
  client: SupabaseClient,
  organizationId: string,
): Promise<SalePartyInput[]> {
  const rows: SalePartyInput[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from("sales")
      .select("id, customer_id, customer_name, customer_phone")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .is("customer_id", null)
      .range(from, from + SALE_PAGE - 1);
    if (error) throw error;
    const batch = (data || []) as SalePartyInput[];
    rows.push(...batch);
    if (batch.length < SALE_PAGE) break;
    from += SALE_PAGE;
  }
  return rows;
}

async function syncUnlinkedSalesIntoCustomerMasterOnce(
  client: SupabaseClient,
  organizationId: string,
): Promise<{ created: number; linked: number }> {
  const [customers, sales] = await Promise.all([
    loadAllCustomers(client, organizationId),
    loadUnlinkedSales(client, organizationId),
  ]);
  const plan = planUnlinkedSaleParties(sales, customers);
  if (plan.creates.length === 0 && plan.links.length === 0) {
    return { created: 0, linked: 0 };
  }

  const createdIds = await insertPlannedCustomers(client, organizationId, plan.creates);
  const saleIdsByCustomer = new Map<string, string[]>();
  for (const [saleId, customerId] of createdIds) {
    const list = saleIdsByCustomer.get(customerId) || [];
    list.push(saleId);
    saleIdsByCustomer.set(customerId, list);
  }
  for (const link of plan.links) {
    const list = saleIdsByCustomer.get(link.customerId) || [];
    list.push(...link.saleIds);
    saleIdsByCustomer.set(link.customerId, list);
    if (link.phoneToSet) {
      const { error } = await client
        .from("customers")
        .update({ phone: link.phoneToSet })
        .eq("id", link.customerId)
        .eq("organization_id", organizationId)
        .is("phone", null);
      if (error) throw error;
    }
  }

  for (const [customerId, saleIds] of saleIdsByCustomer) {
    await linkSalesToCustomer(client, organizationId, customerId, saleIds);
  }

  return {
    created: plan.creates.length,
    linked: plan.links.reduce((sum, link) => sum + link.saleIds.length, 0) + createdIds.size,
  };
}

/**
 * Create Customer Master rows for POS/sale names that were typed on the bill
 * and never saved as customers, then point those bills at the new rows.
 * One run per organization per page load.
 */
export function syncUnlinkedSalesIntoCustomerMaster(
  organizationId: string,
  client: SupabaseClient = defaultClient,
): Promise<{ created: number; linked: number }> {
  if (!organizationId) return Promise.resolve({ created: 0, linked: 0 });
  const inflight = syncByOrg.get(organizationId);
  if (inflight) return inflight;
  const run = syncUnlinkedSalesIntoCustomerMasterOnce(client, organizationId).catch((error) => {
    syncByOrg.delete(organizationId);
    throw error;
  });
  syncByOrg.set(organizationId, run);
  return run;
}
