export type ActivityCategory = "stock" | "payments" | "whatsapp" | "system";

export interface ActivityReadState {
  stock: string;
  payments: string;
  whatsapp: string;
  system: string;
  markAllAt: string;
}

const EMPTY_READ_STATE: ActivityReadState = {
  stock: "",
  payments: "",
  whatsapp: "",
  system: "",
  markAllAt: "",
};

function storageKey(orgId: string, userId: string): string {
  return `ezzy-activity-read:${orgId}:${userId}`;
}

export function loadActivityReadState(orgId: string, userId: string): ActivityReadState {
  try {
    const raw = localStorage.getItem(storageKey(orgId, userId));
    if (!raw) return { ...EMPTY_READ_STATE };
    const parsed = JSON.parse(raw) as Partial<ActivityReadState>;
    return { ...EMPTY_READ_STATE, ...parsed };
  } catch {
    return { ...EMPTY_READ_STATE };
  }
}

export function saveActivityReadState(
  orgId: string,
  userId: string,
  state: ActivityReadState,
): void {
  try {
    localStorage.setItem(storageKey(orgId, userId), JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function isCategoryUnread(
  category: ActivityCategory,
  eventAt: string | null | undefined,
  readState: ActivityReadState,
): boolean {
  if (!eventAt) return false;
  const eventMs = new Date(eventAt).getTime();
  if (!Number.isFinite(eventMs)) return false;
  const markAllMs = readState.markAllAt ? new Date(readState.markAllAt).getTime() : 0;
  if (markAllMs && eventMs <= markAllMs) return false;
  const lastSeen = readState[category];
  if (!lastSeen) return true;
  return eventMs > new Date(lastSeen).getTime();
}

export function markAllCategoriesRead(now = new Date().toISOString()): ActivityReadState {
  return {
    stock: now,
    payments: now,
    whatsapp: now,
    system: now,
    markAllAt: now,
  };
}

export function markCategoryRead(
  readState: ActivityReadState,
  category: ActivityCategory,
  now = new Date().toISOString(),
): ActivityReadState {
  return { ...readState, [category]: now };
}
