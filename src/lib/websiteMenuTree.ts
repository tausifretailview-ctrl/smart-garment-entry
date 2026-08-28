import type { PublicStorefrontMenu, PublicStorefrontMenuFlat } from "@/lib/websiteTypes";

export type WebsiteMenuRow = {
  id: string;
  organization_id: string;
  parent_id: string | null;
  label: string;
  category_filter: string | null;
  display_order: number;
  is_active: boolean;
};

/** Flat RPC/admin rows → nested menu tree for the public storefront. */
export function buildPublicStorefrontMenuTree(
  rows: PublicStorefrontMenuFlat[],
): PublicStorefrontMenu[] {
  const sorted = [...rows].sort(
    (a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label),
  );
  const byParent = new Map<string | null, PublicStorefrontMenu[]>();
  for (const row of sorted) {
    const node: PublicStorefrontMenu = {
      id: row.id,
      label: row.label,
      category_filter: row.category_filter,
      display_order: row.display_order,
      children: [],
    };
    const parentKey = row.parent_id ?? null;
    const bucket = byParent.get(parentKey) ?? [];
    bucket.push(node);
    byParent.set(parentKey, bucket);
  }
  const attach = (nodes: PublicStorefrontMenu[]) => {
    for (const node of nodes) {
      const childKey = node.id;
      const children = byParent.get(childKey) ?? [];
      node.children = children.length > 0 ? children : undefined;
      if (children.length > 0) attach(children);
    }
  };
  const roots = byParent.get(null) ?? [];
  attach(roots);
  return roots;
}
