/**
 * Deno copy of src/utils/authAdminListUsersPaging.ts — edge functions cannot
 * import from the Vite app tree. Keep the two files in lockstep.
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
