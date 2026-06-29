/** Prevent infinite skeleton states on slow mobile WebViews. */
export async function withMobileQueryTimeout<T>(
  fn: () => Promise<T>,
  ms = 12_000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Request timed out")), ms);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
