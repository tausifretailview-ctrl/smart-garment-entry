/**
 * Deno copy of src/utils/authAdminListUsersPaging.ts — edge functions cannot
 * import from the Vite app tree. Keep the two files in lockstep.
 * Redeploy get-users after changing this: `supabase functions deploy get-users`.
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

/**
 * Above this many users, one paged listUsers() read is cheaper than one
 * getUserById() call per user.
 */
export const MAX_USERS_BY_ID = 200;

/** Parallel getUserById() calls in flight at once. */
export const USERS_BY_ID_CONCURRENCY = 10;

/**
 * Look up only the given auth users (a shop's own members) instead of paging the
 * whole platform. Ids whose lookup returns null (deleted auth user) are skipped.
 * Order follows `ids`.
 */
export async function fetchAuthUsersById<T>(
  ids: string[],
  fetchOne: (id: string) => Promise<T | null>,
  concurrency: number = USERS_BY_ID_CONCURRENCY,
): Promise<T[]> {
  const results: (T | null)[] = new Array(ids.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const i = next++;
      results[i] = await fetchOne(ids[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(concurrency, 1), ids.length) }, worker),
  );
  return results.filter((u): u is T => u !== null);
}
