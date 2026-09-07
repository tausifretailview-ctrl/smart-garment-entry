/**
 * GoTrue admin listUsers() defaults to 50 users per page when called with no
 * args. Screens that treat the result as "every platform user" silently drop
 * anyone past that cutoff (POS salesman filter, Employee Master, User Rights,
 * sales reports, Platform Admin, Organization Management).
 *
 * Loop until a page comes back smaller than requested instead of raising a
 * single-call perPage cap — that only moves the same cliff.
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
