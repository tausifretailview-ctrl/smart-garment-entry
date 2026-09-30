/**
 * Reject with `{ code: "timeout:<stage>" }` when `promise` has not settled after `ms`.
 * Push setup awaits browser/Firebase steps that can stall without ever failing; the
 * stage name lets the page show which step it was stuck on.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, stage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error(`timeout:${stage}`), { code: `timeout:${stage}` }));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
