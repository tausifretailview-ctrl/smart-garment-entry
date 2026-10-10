import { supabase } from "@/integrations/supabase/client";

export interface SizeGroupLite {
  id: string;
  group_name: string;
  sizes: string[];
}

export function normalizeSizeGroupName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Another group in the same org with the same name (case/space-insensitive), if any. */
export function findDuplicateSizeGroup<T extends { id: string; group_name: string }>(
  groups: T[],
  name: string,
  excludeId?: string | null,
): T | undefined {
  const key = normalizeSizeGroupName(name).toLowerCase();
  if (!key) return undefined;
  return groups.find(
    (g) => g.id !== excludeId && normalizeSizeGroupName(g.group_name).toLowerCase() === key,
  );
}

/** Sizes in `from` that the `to` group does not have (case-insensitive). */
export function sizesMissingFromTarget(from: string[], to: string[]): string[] {
  const target = new Set(to.map((s) => s.trim().toLowerCase()));
  return from.filter((s) => !target.has(s.trim().toLowerCase()));
}

/** Turn Postgres constraint errors into a message a shop user can act on. */
export function friendlySizeGroupError(error: unknown, fallback: string): string {
  const e = error as { code?: string; message?: string } | null;
  const msg = e?.message || "";
  if (e?.code === "23505" || /size_groups_org_group_name_unique|duplicate key/i.test(msg)) {
    return "A size group with this name already exists. Please use a different name.";
  }
  if (e?.code === "23503" || /violates foreign key constraint/i.test(msg)) {
    return "This size group is still used by products. Move those products to another size group first.";
  }
  return msg || fallback;
}

/** Products (including deleted ones, which the database still links) that use this group. */
export async function countProductsUsingSizeGroup(
  organizationId: string,
  sizeGroupId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("size_group_id", sizeGroupId);
  if (error) throw error;
  return count ?? 0;
}

export async function moveProductsToSizeGroup(
  organizationId: string,
  fromSizeGroupId: string,
  toSizeGroupId: string,
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update({ size_group_id: toSizeGroupId })
    .eq("organization_id", organizationId)
    .eq("size_group_id", fromSizeGroupId);
  if (error) throw error;
}

export async function deleteSizeGroup(sizeGroupId: string): Promise<void> {
  const { error } = await supabase.from("size_groups").delete().eq("id", sizeGroupId);
  if (error) throw error;
}
