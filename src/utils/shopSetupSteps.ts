/** The setup card shows for this many days after a shop is created. */
export const SETUP_SHOW_DAYS = 120;

export interface ShopSetupFacts {
  hasShopDetails: boolean;
  hasBillFormat: boolean;
  products: number;
  customers: number;
  sales: number;
  members: number;
  whatsappOn: boolean;
}

export interface ShopSetupStep {
  id: "details" | "bill" | "products" | "customers" | "staff" | "whatsapp" | "first-bill";
  title: string;
  hint: string;
  action: string;
  path: string;
  state?: Record<string, unknown>;
  done: boolean;
}

/** In the order a new shop should do them: the first bill comes last, once the rest is ready. */
export function buildShopSetupSteps(f: ShopSetupFacts): ShopSetupStep[] {
  return [
    {
      id: "details",
      title: "Shop name, address and mobile",
      hint: "Printed on every bill",
      action: "Add shop details",
      path: "/settings",
      state: { settingsTab: "company" },
      done: f.hasShopDetails,
    },
    {
      id: "bill",
      title: "Choose bill format",
      hint: "Thermal 80mm, A5 or A4",
      action: "Choose bill format",
      path: "/settings",
      state: { settingsTab: "pos" },
      done: f.hasBillFormat,
    },
    {
      id: "products",
      title: "Add products",
      hint: "One by one, or by purchase bill / Excel",
      action: "Add products",
      path: "/product-entry",
      done: f.products > 0,
    },
    {
      id: "customers",
      title: "Add customers",
      hint: "Import your customer list from Excel",
      action: "Add customers",
      path: "/customers",
      done: f.customers > 0,
    },
    {
      id: "staff",
      title: "Add staff login",
      hint: "Give cashiers their own login and rights",
      action: "Add staff",
      path: "/organization-management",
      done: f.members > 1,
    },
    {
      id: "whatsapp",
      title: "Turn on WhatsApp bills",
      hint: "Send bills to customers automatically",
      action: "Set up WhatsApp",
      path: "/settings",
      state: { settingsTab: "whatsapp" },
      done: f.whatsappOn,
    },
    {
      id: "first-bill",
      title: "Make your first bill",
      hint: "Scan a barcode in POS and save",
      action: "Open POS",
      path: "/pos-sales",
      done: f.sales > 0,
    },
  ];
}

export function setupProgress(steps: ShopSetupStep[]): { done: number; total: number; percent: number } {
  const done = steps.filter((s) => s.done).length;
  const total = steps.length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}
