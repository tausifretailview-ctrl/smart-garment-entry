/**
 * GoTrue admin listUsers() defaults to 50 users per page when called with no
 * args. Screens that treat the result as "every platform user" silently drop
 * anyone past that cutoff even when organization_members is valid
 * (mobility@gmail.com with 81 platform users).
 *
 * Shared get-users consumers: POS Dashboard salesman filter, Employee Master
 * user-linking, User Rights, Sales Invoice Dashboard, Item-Wise Sales Report,
 * Platform Admin, Organization Management, User Management.
 *
 * Loop until a page comes back smaller than requested (1000 at a time) instead
 * of raising a single-call perPage cap — that only moves the same cliff.
 * Edge function must be redeployed: `supabase functions deploy get-users`.
 */
export const AUTH_ADMIN_LIST_USERS_PER_PAGE = 1000;

export function shouldFetchNextAuthUserPage(
  receivedCount: number,
  perPage: number = AUTH_ADMIN_LIST_USERS_PER_PAGE,
): boolean {
  return receivedCount >= perPage;
}

export async function accumulateAuthUserPages<T>(
  fetchPage: (page: number, perPage: number) => Promise<T[]>,
  perPage: number = AUTH_ADMIN_LIST_USERS_PER_PAGE,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  for (;;) {
    const users = await fetchPage(page, perPage);
    all.push(...users);
    if (!shouldFetchNextAuthUserPage(users.length, perPage)) return all;
    page += 1;
  }
}
