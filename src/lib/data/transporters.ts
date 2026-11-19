/**
 * Master → Transport Master: the shop's transporters, and the transporter picked for a customer
 * (customers.transporter_id). Database: supabase/migrations/20270507120000_transport_master.sql.
 */
import { supabase } from "@/integrations/supabase/client";

export const TRANSPORT_MODES = [
  { id: "road", label: "Road (lorry / truck)" },
  { id: "courier", label: "Courier" },
  { id: "rail", label: "Rail" },
  { id: "air", label: "Air" },
  { id: "ship", label: "Ship" },
] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number]["id"];

export type Transporter = {
  id: string;
  organization_id: string;
  transporter_name: string;
  transporter_gstin: string | null;
  contact_person: string | null;
  phone: string | null;
  alternate_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  transport_mode: TransportMode;
  vehicle_number: string | null;
  booking_station: string | null;
  delivery_area: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

/** Everything the form edits (id / org / dates are set by the database). */
export type TransporterInput = Omit<Transporter, "id" | "organization_id" | "created_at">;

export const EMPTY_TRANSPORTER: TransporterInput = {
  transporter_name: "",
  transporter_gstin: null,
  contact_person: null,
  phone: null,
  alternate_phone: null,
  email: null,
  address: null,
  city: null,
  state: null,
  pincode: null,
  transport_mode: "road",
  vehicle_number: null,
  booking_station: null,
  delivery_area: null,
  notes: null,
  is_active: true,
};

const COLUMNS =
  "id, organization_id, transporter_name, transporter_gstin, contact_person, phone, alternate_phone, email, address, city, state, pincode, transport_mode, vehicle_number, booking_station, delivery_area, notes, is_active, created_at";

type Table = {
  from: (t: string) => {
    select: (c: string) => any;
    insert: (v: Record<string, unknown>) => any;
    update: (v: Record<string, unknown>) => any;
  };
};
const db = supabase as unknown as Table;

/** True when the transporters table / column has not been added yet (migration not run). */
export function isMissingTransportersTable(error: { message?: string; code?: string } | null | undefined): boolean {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`;
  return /transporter/i.test(text) && /(PGRST20[45]|42P01|42703|does not exist|schema cache|Could not find)/i.test(text);
}

const blank = (v: unknown) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s || null;
};

/** Trims every field, upper-cases GSTIN / vehicle number; returns an error message when invalid. */
export function cleanTransporterInput(input: TransporterInput): { ok: true; value: TransporterInput } | { ok: false; error: string } {
  const name = blank(input.transporter_name);
  if (!name) return { ok: false, error: "Enter the transporter name" };
  if (name.length > 120) return { ok: false, error: "Transporter name is too long" };
  const gstin = blank(input.transporter_gstin)?.toUpperCase().replace(/\s/g, "") ?? null;
  if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) {
    return { ok: false, error: "Transporter GSTIN / ID must be 15 letters or digits" };
  }
  const phone = blank(input.phone)?.replace(/[^\d+]/g, "") || null;
  const alternate = blank(input.alternate_phone)?.replace(/[^\d+]/g, "") || null;
  for (const p of [phone, alternate]) {
    if (p && (p.replace(/\D/g, "").length < 6 || p.length > 20)) return { ok: false, error: "Check the phone number" };
  }
  const email = blank(input.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Check the email address" };
  const pincode = blank(input.pincode)?.replace(/\s/g, "") ?? null;
  if (pincode && !/^\d{6}$/.test(pincode)) return { ok: false, error: "Pincode must be 6 digits" };
  const mode = TRANSPORT_MODES.some((m) => m.id === input.transport_mode) ? input.transport_mode : "road";
  return {
    ok: true,
    value: {
      transporter_name: name,
      transporter_gstin: gstin,
      contact_person: blank(input.contact_person)?.slice(0, 80) ?? null,
      phone,
      alternate_phone: alternate,
      email,
      address: blank(input.address)?.slice(0, 400) ?? null,
      city: blank(input.city)?.slice(0, 60) ?? null,
      state: blank(input.state)?.slice(0, 60) ?? null,
      pincode,
      transport_mode: mode,
      vehicle_number: blank(input.vehicle_number)?.toUpperCase().slice(0, 20) ?? null,
      booking_station: blank(input.booking_station)?.slice(0, 80) ?? null,
      delivery_area: blank(input.delivery_area)?.slice(0, 200) ?? null,
      notes: blank(input.notes)?.slice(0, 500) ?? null,
      is_active: input.is_active !== false,
    },
  };
}

/**
 * Text written to customers.transport_details when a transporter is picked, so invoices that
 * already print that field show the transporter: "VRL Logistics · 98450 12345 · GSTIN …".
 */
export function transporterInvoiceText(t: Pick<Transporter, "transporter_name" | "phone" | "transporter_gstin">): string {
  return [t.transporter_name, t.phone, t.transporter_gstin ? `GSTIN ${t.transporter_gstin}` : null]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 250);
}

/** All transporters of the shop (not removed), A–Z. A shop has tens, not thousands. */
export async function fetchTransporters(orgId: string): Promise<Transporter[]> {
  const { data, error } = await db
    .from("transporters")
    .select(COLUMNS)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("transporter_name", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as Transporter[];
}

function duplicateMessage(error: { code?: string; message?: string }): string | null {
  return error.code === "23505" || /transporters_org_name_key/.test(error.message ?? "")
    ? "A transporter with this name already exists"
    : null;
}

export async function addTransporter(orgId: string, input: TransporterInput, userId?: string | null): Promise<Transporter> {
  const { data, error } = await db
    .from("transporters")
    .insert({ ...input, organization_id: orgId, created_by: userId ?? null })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(duplicateMessage(error) ?? error.message);
  return data as Transporter;
}

export async function updateTransporter(orgId: string, id: string, input: TransporterInput): Promise<void> {
  const { data, error } = await db.from("transporters").update(input).eq("id", id).eq("organization_id", orgId).select("id");
  if (error) throw new Error(duplicateMessage(error) ?? error.message);
  if (!data || data.length === 0) throw new Error("This transporter could not be saved. Reload and try again.");
}

/** Removes from the list; customers that used it keep their printed transport text. */
export async function removeTransporter(orgId: string, id: string): Promise<void> {
  const { data, error } = await db
    .from("transporters")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("This transporter could not be removed. Reload and try again.");
}

/** Only sends transporter_id when it changed, so saving a customer works before the SQL is run. */
export function customerTransporterPatch(next: string, previous?: string | null): { transporter_id?: string | null } {
  const a = next || "";
  const b = previous || "";
  if (a === b) return {};
  return { transporter_id: a || null };
}
